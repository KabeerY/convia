import { localParts } from './calendar.js';
export const hasPoint = (a) => Number.isFinite(a.coordinates?.lat) && Number.isFinite(a.coordinates?.lng);
export function dayRoute(items, branches, branchId, day, timezone) {
  const chain = [];
  let b = branches.find(b => b.branch_id === branchId);
  const seen = new Set();
  while (b && !seen.has(b.branch_id)) { seen.add(b.branch_id); chain.unshift(b); b = branches.find(p => p.branch_id === b.parent_branch_id); }
  let route = items.filter(a => !a.branch_id);
  for (const path of chain) {
    route = route.filter(a => Date.parse(a.starts_at) < Date.parse(path.starts_at) || Date.parse(a.starts_at) >= Date.parse(path.rejoin_at));
    route.push(...items.filter(a => a.branch_id === path.branch_id));
  }
  return route.filter(a => a.starts_at && localParts(a.starts_at, timezone).date === day && !['removed','cancelled'].includes(a.status)).sort((a,b) => Date.parse(a.starts_at)-Date.parse(b.starts_at) || a.item_id.localeCompare(b.item_id));
}
export function googleLinks(stops, maxIntermediate = 3) {
  const points = stops.filter(a => !a.pending && hasPoint(a));
  const coord = a => `${a.coordinates.lat},${a.coordinates.lng}`;
  if (!points.length) return [];
  if (points.length === 1) return [{ url: `https://www.google.com/maps/search/?${new URLSearchParams({api:'1',query:coord(points[0])})}`, stops: points }];
  const links=[];
  for(let i=0;i<points.length-1;i+=maxIntermediate+1) {
    const part=points.slice(i,i+maxIntermediate+2);
    const p=new URLSearchParams({api:'1',origin:coord(part[0]),destination:coord(part.at(-1))});
    if(part.length>2)p.set('waypoints',part.slice(1,-1).map(coord).join('|'));
    links.push({url:`https://www.google.com/maps/dir/?${p}`,stops:part});
  }
  return links;
}
