// IDs come from the supplied PS-11 canonical city seed. The initial trip form
// keeps the choices short; discovery can use the full catalogue later.
export const cities = [
  { id: "cty_9327d518", name: "Manali", region: "Himachal Pradesh", center: { lat: 32.239337, lng: 77.188707 } },
  { id: "cty_43d0a650", name: "Panaji", region: "Goa", center: { lat: 15.49094, lng: 73.827827 } },
  { id: "cty_a97c33ad", name: "Gokarna", region: "Karnataka", center: { lat: 14.5499, lng: 74.3172 } },
  { id: "cty_f29656ff", name: "Aurangabad", region: "Maharashtra", center: { lat: 19.876165, lng: 75.343314 } },
  { id: "cty_95e7c8ca", name: "Mumbai", region: "Maharashtra", center: { lat: 19.075984, lng: 72.877656 } },
  { id: "cty_17b8ef2f", name: "Bengaluru", region: "Karnataka", center: { lat: 12.971599, lng: 77.594566 } },
];

export const cityName = (id) => cities.find((city) => city.id === id)?.name || "Your trip";
export const cityCenter = (id) => cities.find((city) => city.id === id)?.center || null;
