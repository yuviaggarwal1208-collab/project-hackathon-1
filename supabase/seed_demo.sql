-- OPTIONAL: adds 5 clearly-labelled DEMO listings so the marketplace is not empty.
-- Run AFTER you have signed up at least once. Demo rows are flagged is_demo = true,
-- shown with a "Demonstration data" badge and excluded from the real impact numbers.
-- Listings expire after a few hours; run this again to refresh them.
do $$
declare uid uuid; oid uuid; did uuid;
begin
  select id into uid from profiles order by created_at limit 1;
  if uid is null then raise exception 'Sign up on the website first, then run this script.'; end if;
  select organization_id into oid from profiles where id = uid;
  if oid is null then
    insert into organizations(owner_id, name, org_type, city, verification_status, is_demo)
    values (uid, 'Demo Kitchen', 'restaurant', 'Ghaziabad', 'verified', true) returning id into oid;
  end if;

  insert into donations(donor_id, organization_id, title, description, category, diet, quantity_portions, quantity_kg,
    prepared_at, handling_info, allergens, area, city, approx_lat, approx_lng, available_from, pickup_deadline, safety_confirmed, is_demo)
  values
   (uid, oid, 'Veg biryani', 'Freshly cooked, packed in food-grade containers', 'cooked_meal', 'veg', 40, 14, now() - interval '1 hour', 'Kept hot above 60 C, sealed containers', 'None known', 'Vaishali', 'Ghaziabad', 28.64, 77.34, now() - interval '5 minutes', now() + interval '3 hours', true, true),
   (uid, oid, 'Dal and roti trays', 'Canteen surplus', 'cooked_meal', 'veg', 60, 20, now() - interval '2 hours', 'Covered trays, collect within 3 hours', 'Gluten (wheat)', 'Indirapuram', 'Ghaziabad', 28.64, 77.37, now() - interval '5 minutes', now() + interval '2 hours', true, true),
   (uid, oid, 'Assorted bread and buns', 'Baked today', 'bakery', 'veg', 30, 6, now() - interval '3 hours', 'Room temperature, dry place', 'Gluten, milk', 'Kaushambi', 'Ghaziabad', 28.64, 77.33, now() - interval '5 minutes', now() + interval '8 hours', true, true),
   (uid, oid, 'Chicken curry and rice', 'Hotel buffet surplus', 'cooked_meal', 'non_veg', 25, 9, now() - interval '1 hour', 'Hot-held, sealed', 'None known', 'Raj Nagar', 'Ghaziabad', 28.67, 77.44, now() - interval '5 minutes', now() + interval '90 minutes', true, true),
   (uid, oid, 'Seasonal fruit boxes', 'Hostel mess surplus', 'fruits_veg', 'veg', 80, 25, now() - interval '4 hours', 'Cool, dry place', 'None known', 'Crossings Republik', 'Ghaziabad', 28.63, 77.43, now() - interval '5 minutes', now() + interval '12 hours', true, true);
end $$;
