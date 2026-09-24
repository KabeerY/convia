import test from 'node:test';
import assert from 'node:assert/strict';
import {dayRoute,googleLinks,hasPoint} from './map.js';
const item=(id,h,branch_id=null)=>({item_id:id,title:id,starts_at:`2026-10-01T${h}:00:00Z`,branch_id,coordinates:{lat:0,lng:0}});
test('nested branch substitutes only its window and rejoins parent then main',()=>{
 const branches=[{branch_id:'b',starts_at:'2026-10-01T09:00:00Z',rejoin_at:'2026-10-01T13:00:00Z'}, {branch_id:'c',parent_branch_id:'b',starts_at:'2026-10-01T10:00:00Z',rejoin_at:'2026-10-01T11:00:00Z'}];
 const stops=[item('breakfast','08'),item('main','09'),item('lunch','13'),item('b1','09','b'),item('b2','10','b'),item('b3','11','b'),item('c1','10','c')];
 assert.deepEqual(dayRoute(stops,branches,'c','2026-10-01','UTC').map(a=>a.item_id),['breakfast','b1','c1','b3','lunch']);
});
test('handoff parts preserve every stop and repeat their connecting endpoint',()=>{
 const stops=Array.from({length:12},(_,i)=>({...item(String(i),'08'),coordinates:{lat:i,lng:i}}));
 const links=googleLinks(stops);assert.equal(links.length,3);
 assert.equal(links[0].stops.at(-1).item_id,links[1].stops[0].item_id);
 assert.equal(links.at(-1).stops.at(-1).item_id,'11');
 for(const l of links){assert.ok(l.url.length<2048);assert.ok(l.stops.length<=5);}
});
test('missing and proposed stops never enter handoff and zero coordinates are valid',()=>{
 assert.ok(hasPoint(item('a','08')));
 assert.equal(googleLinks([{...item('a','08'),pending:true},{...item('b','09'),coordinates:null}]).length,0);
});
