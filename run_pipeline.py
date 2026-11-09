import os
import subprocess
import sys
from pathlib import Path

def run_command(cmd, cwd=None):
    print(f"\n========================================")
    print(f"RUNNING: {' '.join(cmd)}")
    print(f"========================================")
    result = subprocess.run(cmd, cwd=cwd)
    if result.returncode != 0:
        print(f"ERROR: Command failed with exit code {result.returncode}")
        sys.exit(result.returncode)

def main():
    current_dir = Path(__file__).parent.resolve()
    
    if current_dir.name == "Library Scraper":
        scraper_dir = current_dir
        website_dir = current_dir.parent / "Library Near Website"
    else:
        website_dir = current_dir
        scraper_dir = current_dir.parent / "Library Scraper"
    
    # Step 1: Run enrich_city for all available city CSVs
    cities = []
    for file in scraper_dir.glob("*_libraries.csv"):
        # Ignore already enriched or cleaned files in case they exist
        if "cleaned" in file.name or "enriched" in file.name or "deleted" in file.name:
            continue
        city = file.name.replace("_libraries.csv", "")
        # Skip delhi as requested, and kota/pune as they aren't supported by enrich_city.py yet
        if city in ["delhi", "kota", "pune"]:
            continue
        cities.append(city)
        
    if not cities:
        print("No raw *_libraries.csv files found in Library Scraper!")
        sys.exit(1)
        
    for city in cities:
        print(f"\n--- Enriching {city} ---")
        # enrich_city.py will automatically pick up the raw CSV and export to enriched_final/
        run_command(["python", "enrich_city.py", "--city", city], cwd=str(scraper_dir))
        
    # Step 2: Run ingest.ts
    print("\n--- Ingesting to Supabase ---")
    npx_cmd = "npx.cmd" if sys.platform == "win32" else "npx"
    run_command([npx_cmd, "tsx", "scripts/ingest.ts"], cwd=str(website_dir))
    
    # Step 3: Run fetch_details.py
    print("\n--- Fetching Photos and Details for Free ---")
    run_command(["python", "scripts/fetch_details.py"], cwd=str(website_dir))
    
    print("\n========================================")
    print("PIPELINE COMPLETE! ALL DATA IS LIVE ON YOUR WEBSITE!")
    print("========================================")

if __name__ == "__main__":
    main()
