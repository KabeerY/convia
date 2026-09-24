-- Location metadata follows approved calendar writes, including newly assigned IDs.
CREATE TABLE wm_map_locations (
 item_id text PRIMARY KEY, trip_id text NOT NULL REFERENCES trips(trip_id),
 label text NOT NULL DEFAULT '', lat double precision, lng double precision,
 CHECK ((lat IS NULL AND lng IS NULL) OR (lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180))
);
ALTER TABLE wm_map_locations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON wm_map_locations FROM PUBLIC;
ALTER FUNCTION wm_calendar_apply(text,text,text,text,text,jsonb) RENAME TO wm_calendar_apply_before_map;
CREATE FUNCTION wm_calendar_apply(p_actor text,p_trip text,p_branch text,p_kind text,p_item text,p_data jsonb) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result text;
BEGIN
 result := wm_calendar_apply_before_map(p_actor,p_trip,p_branch,p_kind,p_item,p_data);
 IF p_kind IN ('add','edit') AND p_data ? 'coordinates' THEN
  INSERT INTO wm_map_locations(item_id,trip_id,label,lat,lng)
  VALUES(result,p_trip,coalesce(p_data->>'location',''),(p_data->'coordinates'->>'lat')::double precision,(p_data->'coordinates'->>'lng')::double precision)
  ON CONFLICT(item_id) DO UPDATE SET label=excluded.label,lat=excluded.lat,lng=excluded.lng;
 END IF;
 RETURN result;
END $$;
ALTER FUNCTION wm_calendar_read(text,text) RENAME TO wm_calendar_read_before_map;
CREATE FUNCTION wm_calendar_read(p_actor text,p_trip text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 result := wm_calendar_read_before_map(p_actor,p_trip);
 RETURN jsonb_set(result,'{activities}',coalesce((SELECT jsonb_agg(a || CASE WHEN l.item_id IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('location',l.label,'coordinates',CASE WHEN l.lat IS NULL THEN NULL ELSE jsonb_build_object('lat',l.lat,'lng',l.lng) END) END)
 FROM jsonb_array_elements(result->'activities') a LEFT JOIN wm_map_locations l ON l.item_id=a->>'item_id' AND l.trip_id=p_trip),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION wm_calendar_apply_before_map(text,text,text,text,text,jsonb),wm_calendar_apply(text,text,text,text,text,jsonb),wm_calendar_read_before_map(text,text),wm_calendar_read(text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_calendar_apply(text,text,text,text,text,jsonb) TO convia_command_owner;
GRANT EXECUTE ON FUNCTION wm_calendar_read(text,text) TO convia_runtime;
