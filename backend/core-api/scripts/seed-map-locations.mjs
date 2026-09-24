import pg from 'pg';
// Verified against Nominatim on 2026-09-25. OSM contributors, ODbL.
// Named areas are explicitly labelled; unspecified cafes/meeting points stay unset.
const places=[
 ['Solang Valley paragliding','Solang Valley · area pin; confirm meeting point',32.3160963,77.1565572,'https://www.openstreetmap.org/node/402282690'],
 ['Ajanta Caves','Ajanta Caves',20.5524497,75.6995312,'https://www.openstreetmap.org/way/115567314'],
 ['Ellora morning','Ellora Caves',20.0267525,75.1775152,'https://www.openstreetmap.org/way/115566920'],
];
const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
await db.connect();
try{
 await db.query('BEGIN');
 let count=0;
 for(const [title,label,lat,lng] of places){
  const result=await db.query(`INSERT INTO wm_map_locations(item_id,trip_id,label,lat,lng)
    SELECT i.item_id,i.trip_id,$2,$3,$4 FROM wm_calendar_items i
    JOIN wm_v0_seeded_trips s ON s.trip_id=i.trip_id
    WHERE i.title=$1 AND i.status='confirmed' AND i.branch_id IS NULL
    ON CONFLICT(item_id) DO NOTHING`,[title,label,lat,lng]);count+=result.rowCount;
 }
 await db.query('COMMIT');console.log(`Added ${count} verified seeded locations; existing pins preserved.`);
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
