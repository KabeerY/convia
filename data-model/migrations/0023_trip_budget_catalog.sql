-- Keep the supplied synthetic trips browseable without turning historical or
-- cancelled sample records into joinable groups.
ALTER FUNCTION wm_v0_query(text,text,text,jsonb) RENAME TO wm_v0_query_before_budget_catalog;

CREATE FUNCTION wm_v0_query(p_actor text,p_action text,p_resource text,p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; v_base jsonb; v_budget jsonb; v_destination_currency text; v_viewer_currency text;
BEGIN
  p_filter := coalesce(p_filter,'{}'::jsonb);
  IF p_action='v0.catalog.trips' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'trip_id',t.trip_id,'title',t.title,'destination_city_id',t.destination_city_id,
      'start_date',t.start_date,'end_date',t.end_date,'status',t.status,
      'is_group_trip',t.is_group_trip,'budget',jsonb_build_object(
        'amount',CASE WHEN n.total_cost>0 THEN n.total_cost ELSE NULL END,
        'currency',n.currency,'basis','recorded itinerary total')
    ) ORDER BY t.start_date DESC,t.trip_id),'[]'::jsonb) INTO result
    FROM trips t LEFT JOIN wm_trip_settings s USING(trip_id)
    LEFT JOIN itineraries n ON n.trip_id=t.trip_id AND n.is_active
    WHERE s.trip_id IS NULL
      AND (nullif(p_filter->>'destination_city_id','') IS NULL OR t.destination_city_id=p_filter->>'destination_city_id')
      AND (nullif(p_filter->>'start_date','') IS NULL OR t.start_date >= (p_filter->>'start_date')::date);
    RETURN result;
  ELSIF p_action='v0.catalog.trip_preview' THEN
    SELECT jsonb_build_object('trip',jsonb_build_object(
      'trip_id',t.trip_id,'title',t.title,'destination_city_id',t.destination_city_id,
      'start_date',t.start_date,'end_date',t.end_date,'status',t.status),
      'itinerary_preview',coalesce((SELECT jsonb_agg(jsonb_build_object('item_id',i.item_id,'title',i.title)
        ORDER BY i.day_index,i.sort_order) FROM itinerary_items i JOIN itineraries ni USING(itinerary_id)
        WHERE ni.trip_id=t.trip_id AND ni.is_active AND i.status='confirmed'),'[]'::jsonb),
      'budget',jsonb_build_object('amount',CASE WHEN n.total_cost>0 THEN n.total_cost ELSE NULL END,
        'currency',n.currency,'basis','recorded itinerary total'),
      'destination_currency',co.default_currency,'viewer_currency',u.home_currency,'sample_only',true)
      INTO result FROM trips t LEFT JOIN wm_trip_settings s USING(trip_id)
      LEFT JOIN itineraries n ON n.trip_id=t.trip_id AND n.is_active
      JOIN cities c ON c.city_id=t.destination_city_id JOIN countries co ON co.country_id=c.country_id
      LEFT JOIN users u ON u.user_id=p_actor
      WHERE t.trip_id=p_resource AND s.trip_id IS NULL;
    RETURN result;
  ELSIF p_action='v0.public.preview' THEN
    v_base := wm_v0_query_before_budget_catalog(p_actor,p_action,p_resource,p_filter);
    IF v_base IS NULL THEN RETURN NULL; END IF;
    SELECT jsonb_build_object('amount',CASE WHEN n.total_cost>0 THEN n.total_cost ELSE NULL END,
      'currency',n.currency,'basis','recorded itinerary total'),co.default_currency,u.home_currency
      INTO v_budget,v_destination_currency,v_viewer_currency
      FROM trips t JOIN wm_trip_settings s USING(trip_id)
      LEFT JOIN itineraries n ON n.trip_id=t.trip_id AND n.is_active
      JOIN cities c ON c.city_id=t.destination_city_id JOIN countries co ON co.country_id=c.country_id
      LEFT JOIN users u ON u.user_id=p_actor
      WHERE t.trip_id=p_resource AND s.visibility='public';
    RETURN v_base || jsonb_build_object('budget',v_budget,'destination_currency',v_destination_currency,'viewer_currency',v_viewer_currency);
  END IF;
  RETURN wm_v0_query_before_budget_catalog(p_actor,p_action,p_resource,p_filter);
END $$;

ALTER FUNCTION wm_v0_query(text,text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_v0_query_before_budget_catalog(text,text,text,jsonb),wm_v0_query(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_v0_query(text,text,text,jsonb) TO convia_runtime;
