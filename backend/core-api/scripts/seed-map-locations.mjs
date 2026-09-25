import pg from 'pg';
// Verified against Nominatim on 2026-09-25. OSM contributors, ODbL.
// Named areas are explicitly labelled; unspecified cafes/meeting points stay unset.
const places=[
 ['manali-adventure','Solang Valley paragliding','Solang Valley · area pin; confirm meeting point',32.3160963,77.1565572,'https://www.openstreetmap.org/node/402282690'],
 ['aurangabad-history','Ajanta Caves','Ajanta Caves',20.5524497,75.6995312,'https://www.openstreetmap.org/way/115567314'],
 ['aurangabad-history','Ellora morning','Ellora Caves',20.0267525,75.1775152,'https://www.openstreetmap.org/way/115566920'],
 ['mumbai-food','Colaba neighbourhood walk','Colaba · area pin; confirm starting point',18.9150910,72.8259691,'https://www.openstreetmap.org/node/1640184983'],
 ['mumbai-food','Kala Ghoda cafés','Kala Ghoda · area pin; confirm café',18.9284581,72.8325994,'https://www.openstreetmap.org/node/2630028159'],
 ['manali-adventure','Old Manali café morning','Old Manali · area pin; confirm café',32.2551582,77.1765927,'https://www.openstreetmap.org/way/241258377'],
 ['panaji-food','Fontainhas heritage walk','Fontainhas · area pin; confirm walk start',15.4966560,73.8310810,'https://www.openstreetmap.org/node/1687185066'],
 ['gokarna-nature','Om Beach sunrise','Om Beach · beach pin',14.5190647,74.3254238,'https://www.openstreetmap.org/relation/5926076'],
 ['bengaluru-weekend','Cubbon Park stroll','Cubbon Park · park pin',12.9742535,77.5921906,'https://www.openstreetmap.org/way/22895320'],
 ['mumbai-photo','Gateway of India at dawn','Gateway of India',18.9219661,72.8345657,'https://www.openstreetmap.org/way/28845634'],
 ['gokarna-adventure','Kudle Beach walk','Kudle Beach · beach pin',14.5284471,74.3158565,'https://www.openstreetmap.org/relation/5934584'],
 ['gokarna-adventure','Half Moon Beach trek','Half Moon Beach · destination pin; confirm trailhead',14.5179728,74.3309440,'https://www.openstreetmap.org/relation/5932304'],
];
const db=new pg.Client({connectionString:process.env.MIGRATION_DATABASE_URL});
await db.connect();
try{
 await db.query('BEGIN');
 let count=0;
 for(const [seedKey,title,label,lat,lng] of places){
  const result=await db.query(`INSERT INTO wm_map_locations(item_id,trip_id,label,lat,lng)
    SELECT i.item_id,i.trip_id,$3,$4,$5 FROM wm_calendar_items i
    JOIN wm_v0_seeded_trips s ON s.trip_id=i.trip_id
    WHERE s.seed_key=$1 AND i.title=$2 AND i.status='confirmed' AND i.branch_id IS NULL
    ON CONFLICT(item_id) DO NOTHING`,[seedKey,title,label,lat,lng]);count+=result.rowCount;
 }
 await db.query('COMMIT');console.log(`Added ${count} verified seeded locations; existing pins preserved.`);
}catch(e){await db.query('ROLLBACK');throw e;}finally{await db.end();}
