-- Migration: Assign unassigned rides to a bike
-- This script assigns all rides with bike_id = NULL to a specific bike

-- Step 1: View all bikes for this user
-- SELECT id, name, make, model FROM bikes WHERE owner_id = 1;

-- Step 2: View unassigned rides
-- SELECT id, title, started_at, bike_id FROM rides WHERE bike_id IS NULL;

-- Step 3: Update unassigned rides to assign them to bike_id = 1 (replace with your bike's ID)
-- IMPORTANT: Replace '1' with the actual bike_id from Step 1
UPDATE rides 
SET bike_id = (SELECT id FROM bikes LIMIT 1)
WHERE bike_id IS NULL;

-- Step 4: Verify the update
-- SELECT id, title, started_at, bike_id FROM rides ORDER BY started_at DESC;
