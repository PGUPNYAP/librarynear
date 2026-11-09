"""
fetch_images.py
---------------
Fetch up to 3 Google Maps photos for each library, upload them to ImageKit,
and store the resulting ImageKit URLs in Supabase's library_images table.

Setup:
    pip install playwright supabase requests
    playwright install chromium

Required in .env.local:
    NEXT_PUBLIC_SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY
    IMAGEKIT_PRIVATE_KEY

Optional in .env.local:
    FETCH_IMAGES_HEADLESS=true
    FETCH_IMAGES_LIMIT=5
"""

from __future__ import annotations

import base64
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Any
from urllib.parse import quote_plus

import requests
from playwright.sync_api import Page, sync_playwright
from supabase import Client, create_client

ENV_PATH = Path(__file__).parent.parent / ".env.local"

SUPABASE_PAGE_SIZE = 500
TARGET_IMAGES_PER_LIBRARY = 3
SEARCH_WAIT_MS = 3_500
GALLERY_WAIT_MS = 2_000
MAX_GALLERY_STEPS = 8
MAX_DOWNLOAD_RETRIES = 3
MAX_UPLOAD_RETRIES = 3
MIN_IMAGE_BYTES = 12_000
REQUEST_TIMEOUT_SECONDS = 30
LIBRARY_DELAY_SECONDS = 2
HEADLESS = os.environ.get("FETCH_IMAGES_HEADLESS", "false").strip().lower() in {
    "1",
    "true",
    "yes",
}
LIMIT_RAW = os.environ.get("FETCH_IMAGES_LIMIT", "").strip()
FETCH_IMAGES_LIMIT = int(LIMIT_RAW) if LIMIT_RAW.isdigit() and int(LIMIT_RAW) > 0 else None

SEARCH_RESULT_SELECTORS = [
    "a[href*='/maps/place/']",
]

PHOTO_TRIGGER_SELECTORS = [
    "button[aria-label*='Photo']",
    "button[aria-label*='photo']",
    "button[jsaction*='pane.heroHeaderImage.click']",
    "div[data-photo-index]",
    "div[aria-label*='photo'] button",
    "img[src*='googleusercontent']",
]

NEXT_BUTTON_SELECTORS = [
    "button[aria-label='Next photo']",
    "button[aria-label='Next']",
    "button[jsaction*='pane.heroHeaderImage.next']",
    "button[jsaction*='gallery.next']",
]

IMAGE_CANDIDATE_SELECTOR = (
    "div[role='dialog'] img[src*='googleusercontent'], "
    "div[role='main'] img[src*='googleusercontent'], "
    "img[src*='googleusercontent']"
)

HTTP = requests.Session()
HTTP.headers.update(
    {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/135.0.0.0 Safari/537.36"
        )
    }
)


def load_env_file(filepath: Path) -> None:
    if not filepath.exists():
        return

    for raw_line in filepath.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


load_env_file(ENV_PATH)

SUPABASE_URL = os.environ.get("NEXT_PUBLIC_SUPABASE_URL", "").strip()
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip()
IK_PRIVATE_KEY = os.environ.get("IMAGEKIT_PRIVATE_KEY", "").strip()

missing = [
    key
    for key, value in {
        "NEXT_PUBLIC_SUPABASE_URL": SUPABASE_URL,
        "SUPABASE_SERVICE_ROLE_KEY": SUPABASE_KEY,
        "IMAGEKIT_PRIVATE_KEY": IK_PRIVATE_KEY,
    }.items()
    if not value
]

if missing:
    raise SystemExit(f"ERROR: Missing env vars: {', '.join(missing)}")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def fetch_all_rows(table: str, columns: str, page_size: int = SUPABASE_PAGE_SIZE) -> list[dict[str, Any]]:
    rows: list[dict[str, Any]] = []
    offset = 0

    while True:
        response = (
            supabase.table(table)
            .select(columns)
            .range(offset, offset + page_size - 1)
            .execute()
        )
        batch = response.data or []
        rows.extend(batch)
        if len(batch) < page_size:
            break
        offset += page_size

    return rows


def build_queries(name: str, display_name: str, locality: str, city: str) -> tuple[list[str], dict]:
    candidates = [
        f"{name} {locality} {city}".strip(),
        f"{display_name} {city}".strip(),
        f"{name} {city}".strip(),
        display_name.strip(),
        name.strip(),
    ]

    queries: list[str] = []
    seen: set[str] = set()
    for candidate in candidates:
        normalized = " ".join(candidate.split())
        if normalized and normalized.lower() not in seen:
            seen.add(normalized.lower())
            queries.append(normalized)
    return queries


def try_click_first_visible(page: Page, selectors: list[str], timeout_ms: int = 2000) -> bool:
    for selector in selectors:
        locator = page.locator(selector).first
        try:
            if locator.is_visible(timeout=timeout_ms):
                locator.click(timeout=timeout_ms)
                return True
        except Exception:
            continue
    return False


def normalize_google_image_url(url: str) -> tuple[str | None, str | None]:
    candidate = (url or "").strip()
    if not candidate or "googleusercontent" not in candidate:
        return None, None

    base = candidate.split("=")[0]
    if not base.startswith("http"):
        return None, None

    full_res = f"{base}=w1600-h1200-k-no"
    return base, full_res


def dedupe_google_image_urls(urls: list[str]) -> tuple[list[str], dict]:
    deduped: list[str] = []
    seen_bases: set[str] = set()

    for url in urls:
        base, normalized = normalize_google_image_url(url)
        if not base or not normalized or base in seen_bases:
            continue
        seen_bases.add(base)
        deduped.append(normalized)
        if len(deduped) >= TARGET_IMAGES_PER_LIBRARY:
            break

    return deduped


def parse_google_json_response(raw_text: str) -> Any | None:
    if not raw_text:
        return None
    try:
        return json.loads(raw_text.split("\n", 1)[1])
    except Exception:
        return None


def extract_size_score(url: str) -> int:
    match = re.search(r"=w(\d+)-h(\d+)", url)
    if match:
        return int(match.group(1)) * int(match.group(2))
    return 0


def collect_place_page_images(page: Page) -> list[str]:
    try:
        images = page.locator("img[src*='googleusercontent']").evaluate_all(
            """
            (elements) => elements.map((el) => {
              const rect = el.getBoundingClientRect();
              return {
                src: el.getAttribute("src") || "",
                width: rect.width || 0,
                height: rect.height || 0,
              };
            })
            """
        )
    except Exception:
        return []

    ranked: list[tuple[float, str]] = []
    for image in images:
        src = str(image.get("src", ""))
        if "googleusercontent" not in src:
            continue
        _, normalized = normalize_google_image_url(src)
        if not normalized:
            continue
        area = float(image.get("width", 0)) * float(image.get("height", 0))
        area = area if area > 0 else float(extract_size_score(src))
        if area < 10_000:
            continue
        ranked.append((area, normalized))

    ranked.sort(reverse=True, key=lambda item: item[0])
    urls: list[str] = []
    for _, url in ranked:
        if url not in urls:
            urls.append(url)
        if len(urls) >= TARGET_IMAGES_PER_LIBRARY:
            break
    return urls


def get_current_gallery_image(page: Page) -> str | None:
    try:
        images = page.locator(IMAGE_CANDIDATE_SELECTOR).evaluate_all(
            """
            (elements) => elements.map((el) => {
              const rect = el.getBoundingClientRect();
              return {
                src: el.getAttribute("src") || "",
                width: rect.width || 0,
                height: rect.height || 0,
                visible: rect.width > 140 && rect.height > 140,
              };
            })
            """
        )
    except Exception:
        return None

    best_url: str | None = None
    best_area = 0.0

    for image in images:
        src = str(image.get("src", ""))
        if "googleusercontent" not in src:
            continue
        dom_area = float(image.get("width", 0)) * float(image.get("height", 0))
        area = dom_area if dom_area > 0 else float(extract_size_score(src))
        if area > best_area:
            best_area = area
            _, full_res = normalize_google_image_url(src)
            best_url = full_res

    return best_url


def open_best_match(page: Page, query: str) -> bool:
    search_url = f"https://www.google.com/maps/search/{quote_plus(query)}?hl=en"
    page.goto(search_url, timeout=REQUEST_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
    page.wait_for_timeout(SEARCH_WAIT_MS)

    if "/maps/place/" in page.url:
        return True

    if try_click_first_visible(page, SEARCH_RESULT_SELECTORS, timeout_ms=2500):
        page.wait_for_timeout(2500)
        return True

    return "/maps/place/" in page.url


def open_map_link(page: Page, map_link: str) -> bool:
    page.goto(map_link, timeout=REQUEST_TIMEOUT_SECONDS * 1000, wait_until="domcontentloaded")
    page.wait_for_timeout(SEARCH_WAIT_MS)
    return "/maps/place/" in page.url or "google.com/maps" in page.url


def open_photo_gallery(page: Page) -> bool:
    preferred_labels = [
        "See photos",
        "Photo of",
        "photo of",
        "View all photos",
    ]

    for label in preferred_labels:
        try:
            target = page.get_by_label(re.compile(label)).first
            if target.is_visible(timeout=1500):
                target.click(timeout=2500)
                page.wait_for_timeout(GALLERY_WAIT_MS)
                return True
        except Exception:
            pass

    try:
        target = page.get_by_text("See photos").first
        if target.is_visible(timeout=1500):
            target.click(timeout=2500)
            page.wait_for_timeout(GALLERY_WAIT_MS)
            return True
    except Exception:
        pass

    if try_click_first_visible(page, PHOTO_TRIGGER_SELECTORS, timeout_ms=2500):
        page.wait_for_timeout(GALLERY_WAIT_MS)
        return True
    return False


def advance_gallery(page: Page) -> bool:
    if try_click_first_visible(page, NEXT_BUTTON_SELECTORS, timeout_ms=1500):
        page.wait_for_timeout(1200)
        return True

    try:
        page.keyboard.press("ArrowRight")
        page.wait_for_timeout(1200)
        return True
    except Exception:
        return False


def extract_urls_from_photometa(raw_text: str) -> list[str]:
    payload = parse_google_json_response(raw_text)
    if not isinstance(payload, list) or len(payload) < 2 or not payload[1]:
        return []

    entry = payload[1][0]
    if not isinstance(entry, list):
        return []

    urls: list[str] = []
    for item in entry:
        if isinstance(item, list):
            stack = [item]
            while stack:
                current = stack.pop()
                if isinstance(current, list):
                    stack.extend(current)
                elif isinstance(current, str) and "googleusercontent.com" in current:
                    _, normalized = normalize_google_image_url(current.replace("\\u003d", "="))
                    if normalized and normalized not in urls:
                        urls.append(normalized)
    return urls


def collect_response_backed_photo_urls(page: Page, timeout_ms: int = 6000) -> list[str]:
    captured: list[str] = []

    def handle_response(response) -> None:
        if "maps/photometa/v1" not in response.url:
            return
        try:
            captured.append(response.text())
        except Exception:
            return

    page.on("response", handle_response)
    try:
        if not open_photo_gallery(page):
            return []
        page.wait_for_timeout(timeout_ms)
    finally:
        try:
            page.remove_listener("response", handle_response)
        except Exception:
            pass

    urls: list[str] = []
    for raw_text in captured:
        for url in extract_urls_from_photometa(raw_text):
            if url not in urls:
                urls.append(url)
    return urls[:TARGET_IMAGES_PER_LIBRARY]


def collect_gallery_images(page: Page) -> list[str]:
    results: list[str] = []
    seen_bases: set[str] = set()

    for _ in range(MAX_GALLERY_STEPS):
        image_url = get_current_gallery_image(page)
        if image_url:
            base, normalized = normalize_google_image_url(image_url)
            if base and normalized and base not in seen_bases:
                seen_bases.add(base)
                results.append(normalized)
                print(f"    Found photo {len(results)}", flush=True)
                if len(results) >= TARGET_IMAGES_PER_LIBRARY:
                    return results

        if not advance_gallery(page):
            break

    return results


def scrape_google_maps_images_and_details(
    page: Page,
    name: str,
    display_name: str,
    locality: str,
    city: str,
    map_link: str,
) -> tuple[list[str], dict]:
    print(f"  Fetching details for {display_name}", flush=True)

    details = {}
    if map_link:
        try:
            print("    Using stored map_link", flush=True)
            if open_map_link(page, map_link):
                details = extract_place_details(page)
                return [], details
            else:
                print("    Stored map_link did not open successfully.", flush=True)
        except Exception as exc:
            print(f"    Map link failed: {exc}", flush=True)

    print("    Falling back to Maps search", flush=True)

    for query in build_queries(name, display_name, locality, city):
        print(f"    Query: {query}", flush=True)
        try:
            if not open_best_match(page, query):
                continue

            details = extract_place_details(page)
            return [], details
        except Exception as exc:
            print(f"    Playwright error for query '{query}': {exc}", flush=True)

    return [], details



def extract_place_details(page: Page) -> dict:
    details = {}
    try:
        phone_el = page.locator("button[data-tooltip='Copy phone number']").first
        if phone_el.is_visible(timeout=1000):
            details["phone_number"] = phone_el.inner_text().replace("\ue0b0", "").replace("\n", " ").strip()
    except Exception:
        pass

    try:
        address_el = page.locator("button[data-tooltip='Copy address']").first
        if address_el.is_visible(timeout=1000):
            details["formatted_address"] = address_el.inner_text().replace("\ue0c8", "").replace("\n", " ").strip()
    except Exception:
        pass

    try:
        website_el = page.locator("a[data-tooltip='Open website']").first
        if website_el.is_visible(timeout=1000):
            details["map_link"] = website_el.get_attribute("href") # usually map link or website
            # Wait, let's not overwrite map_link.
    except Exception:
        pass

    try:
        rating_el = page.locator("span[role='img'][aria-label*='stars']").first
        if rating_el.is_visible(timeout=1000):
            label = rating_el.get_attribute("aria-label") or ""
            match = re.search(r"([\d.]+)\s*stars?", label)
            if match:
                details["aggregate_rating"] = float(match.group(1))

        reviews_el = page.locator("button[aria-label*='reviews']").first
        if reviews_el.is_visible(timeout=1000):
            text = reviews_el.inner_text()
            match = re.search(r"([\d,]+)", text)
            if match:
                details["review_count"] = int(match.group(1).replace(",", ""))
    except Exception:
        pass

    details["is_enriched"] = True
    return details

def download_image(url: str) -> bytes | None:
    for attempt in range(1, MAX_DOWNLOAD_RETRIES + 1):
        try:
            response = HTTP.get(
                url,
                timeout=15,
                headers={
                    "Referer": "https://www.google.com/maps/",
                    "Accept": "image/webp,image/apng,image/*,*/*;q=0.8",
                },
            )
            content_type = response.headers.get("Content-Type", "")
            data = response.content
            if response.status_code == 200 and content_type.startswith("image/") and len(data) >= MIN_IMAGE_BYTES:
                print(
                    f"    [Download OK] {len(data) // 1024}KB, type={content_type.split(';')[0]}",
                    flush=True,
                )
                return data

            print(
                f"    [Download FAIL attempt {attempt}] status={response.status_code}, "
                f"type={content_type}, bytes={len(data)}",
                flush=True,
            )
        except Exception as exc:
            print(f"    [Download EXCEPTION attempt {attempt}] {exc}", flush=True)

        time.sleep(attempt)

    return None


def upload_to_imagekit(image_bytes: bytes, filename: str, folder: str) -> str | None:
    payload = base64.b64encode(image_bytes).decode("utf-8")

    for attempt in range(1, MAX_UPLOAD_RETRIES + 1):
        try:
            response = HTTP.post(
                "https://upload.imagekit.io/api/v1/files/upload",
                auth=(IK_PRIVATE_KEY, ""),
                data={
                    "file": payload,
                    "fileName": filename,
                    "folder": folder,
                    "isPrivateFile": "false",
                    "useUniqueFileName": "true",
                },
                timeout=REQUEST_TIMEOUT_SECONDS,
            )
            if response.status_code == 200:
                url = str(response.json().get("url", "")).strip()
                if url:
                    return url
                print(f"    [ImageKit ERROR] Upload succeeded without url for {filename}", flush=True)
            elif response.status_code == 403 and "Upload Limit" in response.text:
                print("    [ImageKit ERROR] Upload Limit Exceeded. Stopping all future uploads.", flush=True)
                return "LIMIT_EXCEEDED" 
            else:
                print(
                    f"    [ImageKit ERROR attempt {attempt}] {response.status_code}: "
                    f"{response.text[:300]}",
                    flush=True,
                )
        except Exception as exc:
            print(f"    [ImageKit EXCEPTION attempt {attempt}] {exc}", flush=True)

        time.sleep(attempt)

    return None


def persist_library_images(library_id: str, display_name: str, uploaded_urls: list[str]) -> None:
    if not uploaded_urls:
        return

    # Replace the library's existing photo set so reruns stay deterministic.
    supabase.table("library_images").delete().eq("library_branch_id", library_id).execute()

    records = [
        {
            "library_branch_id": library_id,
            "imagekit_url": url,
            "alt_text": f"{display_name} photo {index + 1}",
            "is_cover": index == 0,
            "sort_order": index,
        }
        for index, url in enumerate(uploaded_urls[:TARGET_IMAGES_PER_LIBRARY])
    ]

    supabase.table("library_images").insert(records).execute()


def main() -> None:
    print("Fetching all libraries from Supabase...", flush=True)
    all_libraries = fetch_all_rows("library_branches", "id,name,display_name,locality,city,map_link")
    print(f"  Found {len(all_libraries)} libraries.", flush=True)

    print("Checking which libraries already have images...", flush=True)
    existing_rows = fetch_all_rows("library_images", "library_branch_id")
    existing_image_ids = {row["library_branch_id"] for row in existing_rows if row.get("library_branch_id")}
    print(f"  {len(existing_image_ids)} already have images.", flush=True)

    to_process = [library for library in all_libraries if library["id"] not in existing_image_ids]
    if FETCH_IMAGES_LIMIT is not None:
        to_process = to_process[:FETCH_IMAGES_LIMIT]
    print(f"  {len(to_process)} need images. Starting...\n", flush=True)

    if not to_process:
        print("All libraries already have images. Nothing to do.", flush=True)
        return

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=HEADLESS)
        context = browser.new_context(locale="en-US")
        page = context.new_page()

        try:
            for index, library in enumerate(to_process, start=1):
                library_id = library["id"]
                name = (library.get("name") or library.get("display_name") or "").strip()
                display_name = (library.get("display_name") or name or "Library").strip()
                locality = (library.get("locality") or "").strip()
                city = (library.get("city") or "").strip()
                map_link = (library.get("map_link") or "").strip()

                print(f"[{index}/{len(to_process)}] {display_name}", flush=True)
                scraped_urls, details = scrape_google_maps_images_and_details(page, name, display_name, locality, city, map_link)

                if details:
                    print(f"  -> Extracted details: {details}", flush=True)
                    try:
                        supabase.table("library_branches").update(details).eq("id", library_id).execute()
                    except Exception as e:
                        print(f"  -> DB Update failed: {e}")

                if not scraped_urls:
                    print("  -> Skipped (no images scraped).\n", flush=True)
                    time.sleep(LIBRARY_DELAY_SECONDS)
                    continue

                # --- IMAGE SCRAPING COMMENTED OUT AS REQUESTED ---
                # uploaded_urls: list[str] = []
                # seen_hashes: set[str] = set()
                # for photo_index, scraped_url in enumerate(scraped_urls, start=1):
                #     image_bytes = download_image(scraped_url)
                #     if not image_bytes:
                #         continue
                #
                #     image_hash = hashlib.sha256(image_bytes).hexdigest()
                #     if image_hash in seen_hashes:
                #         print("  [Skipped duplicate image content]", flush=True)
                #         continue
                #     seen_hashes.add(image_hash)
                #
                #     imagekit_url = upload_to_imagekit(
                #         image_bytes=image_bytes,
                #         filename=f"photo_{photo_index}.jpg",
                #         folder=f"/libraries/{library_id}",
                #     )
                #     if imagekit_url == "LIMIT_EXCEEDED":
                #         uploaded_urls = []
                #         global TARGET_IMAGES_PER_LIBRARY
                #         TARGET_IMAGES_PER_LIBRARY = 0
                #         break
                #     if imagekit_url and imagekit_url not in uploaded_urls:
                #         uploaded_urls.append(imagekit_url)
                #         print(f"  [Uploaded {len(uploaded_urls)}] {imagekit_url}", flush=True)
                #
                #     if len(uploaded_urls) >= TARGET_IMAGES_PER_LIBRARY:
                #         break
                #
                # if not uploaded_urls:
                #     print("  -> All uploads failed.\n", flush=True)
                #     time.sleep(LIBRARY_DELAY_SECONDS)
                #     continue
                #
                # persist_library_images(library_id, display_name, uploaded_urls)
                # print(f"  -> Saved {len(uploaded_urls)} photos. They are live in Supabase.\n", flush=True)
                
                # We just delay briefly before moving to the next library
                time.sleep(LIBRARY_DELAY_SECONDS)
                print("  -> Finished scraping details (Images skipped).\n", flush=True)
        except KeyboardInterrupt:
            print("\nStopped by user.", flush=True)
        finally:
            context.close()
            browser.close()


if __name__ == "__main__":
    main()
