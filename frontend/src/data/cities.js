// IDs come from the supplied PS-11 canonical city seed. The initial trip form
// keeps the choices short; discovery can use the full catalogue later.
export const cities = [
  { id: "cty_9327d518", name: "Manali", region: "Himachal Pradesh" },
  { id: "cty_43d0a650", name: "Panaji", region: "Goa" },
  { id: "cty_a97c33ad", name: "Gokarna", region: "Karnataka" },
  { id: "cty_f29656ff", name: "Aurangabad", region: "Maharashtra" },
  { id: "cty_95e7c8ca", name: "Mumbai", region: "Maharashtra" },
  { id: "cty_17b8ef2f", name: "Bengaluru", region: "Karnataka" },
];

export const cityName = (id) => cities.find((city) => city.id === id)?.name || "Your trip";
