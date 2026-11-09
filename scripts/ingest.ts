import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';
import * as Papa from 'papaparse';
import * as dotenv from 'dotenv';

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials in .env.local.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

type CsvRow = Record<string, string>;
type FeePlanCsvInput = {
  plan_name?: string;
  plan_type?: string | null;
  price?: number;
  currency?: string;
  duration_label?: string | null;
  description?: string | null;
};

function generateSlug(name: string, locality: string, branch: string) {
  const base = `${name} ${branch} ${locality}`.trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '');
  return base || `library-${Date.now()}`;
}

async function ingestData() {
  const enrichedDir = path.resolve(process.cwd(), '../Library Scraper/enriched_final');
  
  if (!fs.existsSync(enrichedDir)) {
    console.error(`Directory not found: ${enrichedDir}`);
    return;
  }

  const files = fs.readdirSync(enrichedDir).filter(f => f.endsWith('.csv'));
  
  if (files.length === 0) {
    console.log(`No CSV files found in ${enrichedDir}`);
    return;
  }

  for (const file of files) {
    const csvFilePath = path.join(enrichedDir, file);
    console.log(`\n--- Reading CSV from ${csvFilePath} ---`);

    const csvFile = fs.readFileSync(csvFilePath, 'utf8');
    const results = Papa.parse<CsvRow>(csvFile, {
      header: true,
      skipEmptyLines: true,
    });

    console.log(`Parsed ${results.data.length} rows.`);

    for (const row of results.data) {
      try {
        const name = row['Name'] || 'Unnamed Library';
        const locality = row['Display Locality'] || row['Locality'] || '';
        const branch = row['Branch'] || '';
        const slug = generateSlug(name, locality, branch);

        const display_name = locality ? `${name}, ${locality}` : name;

        const branchData = {
          slug,
          name,
          branch: branch || null,
          display_name,
          pin_code: row['Pin Code'] || '110000',
          city: row['City'] || 'Delhi',
          state: row['State'] || 'Delhi',
          locality: row['Display Locality'] || null,
          district: row['Locality District'] || null,
          formatted_address: row['Formatted Address'] || null,
          full_address: row['Full Address'] || null,
          latitude: row['Latitude'] ? parseFloat(row['Latitude']) : null,
          longitude: row['Longitude'] ? parseFloat(row['Longitude']) : null,
          map_link: row['Map Link'] || null,
          nearest_metro: row['Nearest Metro'] || null,
          nearest_metro_line: row['Nearest Metro Line'] || null,
          nearest_metro_distance_km: row['Nearest Metro Distance Km'] ? parseFloat(row['Nearest Metro Distance Km']) : null,
          whatsapp_number: row['WhatsApp Number'] || null,
          total_seats: row['Total Seats'] ? parseInt(row['Total Seats']) : null,
          opening_time: row['Opening Time'] || null,
          closing_time: row['Closing Time'] || null,
          amenities_text: row['Library Facilities'] || null,
          created_source: 'csv_import_v1',
          is_active: true
        };

        // 1. Upsert Branch
        const { data: branchResult, error: branchError } = await supabase
          .from('library_branches')
          .upsert(branchData, { onConflict: 'slug' })
          .select('id')
          .single();

        if (branchError) {
          console.error(`Error inserting branch ${name}:`, branchError.message);
          continue;
        }

        const branchId = branchResult.id;

        // 2. Insert Fee Plans
        const feePlansJson = row['Library Fee Plans JSON'];
        if (feePlansJson) {
          try {
            const plans = JSON.parse(feePlansJson) as unknown;
            if (Array.isArray(plans) && plans.length > 0) {
              // Delete existing ones to prevent duplicates on re-run
              await supabase.from('library_fee_plans').delete().eq('library_branch_id', branchId);
              
              const planRecords = (plans as FeePlanCsvInput[]).map((p, index) => ({
                library_branch_id: branchId,
                plan_name: p.plan_name || 'Standard Plan',
                plan_type: p.plan_type || null,
                price: typeof p.price === 'number' ? p.price : 0,
                currency: p.currency || 'INR',
                duration_label: p.duration_label || null,
                description: p.description || null,
                sort_order: index
              }));

              await supabase.from('library_fee_plans').insert(planRecords);
            }
          } catch {
            console.warn(`Could not parse JSON fee plans for ${name}`);
          }
        }

        // 3. Insert Images (only if they exist in CSV, which they don't anymore usually)
        const photosJson = row['Library Photos JSON'];
        if (photosJson) {
          try {
            const photos = JSON.parse(photosJson) as unknown;
            if (Array.isArray(photos) && photos.length > 0) {
              await supabase.from('library_images').delete().eq('library_branch_id', branchId);
              
              const photoRecords = photos
                .filter((url): url is string => typeof url === 'string' && url.length > 0)
                .map((url, index) => ({
                library_branch_id: branchId,
                imagekit_url: url,
                is_cover: index === 0,
                sort_order: index
              }));

              await supabase.from('library_images').insert(photoRecords);
            }
          } catch {
            // Not critical
          }
        }

      } catch (err) {
        console.error(`Unexpected error processing row:`, err);
      }
    }
    console.log(`Finished ingesting ${file}`);
  }
  
  console.log('All CSVs ingested successfully.');
}

ingestData();
