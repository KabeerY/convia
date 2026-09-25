-- Expose the supplied PS-11 reference catalogue without changing canonical tables.
ALTER FUNCTION wm_v0_query(text,text,text,jsonb) RENAME TO wm_v0_query_before_catalog;

CREATE FUNCTION wm_v0_query(p_actor text,p_action text,p_resource text,p_filter jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
  p_filter := coalesce(p_filter,'{}'::jsonb);
  IF p_action='v0.catalog.cities' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'id',c.city_id,'name',c.name,'region',c.region,'country',n.name,
      'country_code',c.country_code,'currency',n.default_currency,
      'timezone',c.timezone,'lat',c.lat,'lng',c.lng
    ) ORDER BY c.name,c.city_id),'[]'::jsonb) INTO result
    FROM cities c JOIN countries n USING(country_id) WHERE c.status='active';
    RETURN result;
  ELSIF p_action='v0.catalog.guides' THEN
    SELECT coalesce(jsonb_agg(jsonb_build_object(
      'guide_id',g.guide_id,'city_id',g.city_id,'display_name',g.display_name,
      'languages',g.languages,'specialisation',g.specialisation,
      'secondary_specialisation',g.secondary_specialisation,
      'years_experience',g.years_experience,'rating',g.rating,
      'review_count',g.review_count,'day_rate',g.day_rate,
      'half_day_rate',g.half_day_rate,'currency',g.currency,
      'certified',g.certified,'bio',g.bio
    ) ORDER BY g.rating DESC NULLS LAST,g.review_count DESC,g.guide_id),'[]'::jsonb) INTO result
    FROM tour_guides g WHERE g.status='active'
      AND (nullif(p_filter->>'city_id','') IS NULL OR g.city_id=p_filter->>'city_id');
    RETURN result;
  END IF;
  RETURN wm_v0_query_before_catalog(p_actor,p_action,p_resource,p_filter);
END $$;

ALTER FUNCTION wm_v0_query(text,text,text,jsonb) OWNER TO convia_command_owner;
REVOKE ALL ON FUNCTION wm_v0_query_before_catalog(text,text,text,jsonb),wm_v0_query(text,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION wm_v0_query(text,text,text,jsonb) TO convia_runtime;
