import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { dayRoute, googleLinks, hasPoint } from './lib/map';
import { localParts, timeString } from './lib/calendar';
import './map.css';

export function MapCanvas({ stops = [], onSelect, onPick, value, selected, connections = [] }) {
  const host = useRef(null), instance = useRef(null), layer = useRef(null), handlers = useRef({onSelect,onPick});
  const [error,setError]=useState('');
  handlers.current={onSelect,onPick};
  const geometry=JSON.stringify(stops), point=JSON.stringify(value), connectionKey=JSON.stringify(connections);
  useEffect(() => {
    const map=L.map(host.current,{scrollWheelZoom:false}).setView([22.5,79],5);
    instance.current=map;
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'}).on('tileerror',()=>setError('Some map tiles could not load. Your stops are still available below.')).addTo(map);
    layer.current=L.layerGroup().addTo(map);
    map.on('click',e=>handlers.current.onPick?.({lat:e.latlng.lat,lng:e.latlng.lng}));
    const observer=new ResizeObserver(()=>map.invalidateSize());observer.observe(host.current);
    return ()=>{observer.disconnect();map.remove();instance.current=null;};
  },[]);
  useEffect(()=>{
    const map=instance.current;if(!map)return;
    layer.current.clearLayers();
    const bounds=[];
    // Never join across a missing location: that would suggest a complete route.
    stops.forEach((s,i)=>{
      if(!hasPoint(s))return;
      const p=[s.coordinates.lat,s.coordinates.lng];bounds.push(p);
      const marker=L.marker(p,{icon:L.divIcon({className:`cm-marker ${s.pending?'proposed':''}`,html:`<span>${i+1}</span>`,iconSize:[30,30],iconAnchor:[15,15]}),title:s.title,keyboard:true}).addTo(layer.current);
      marker.on('click',()=>handlers.current.onSelect?.(s));
      const label=document.createElement('span');label.textContent=s.title;marker.bindTooltip(label);
      if(i && hasPoint(stops[i-1])) L.polyline([[stops[i-1].coordinates.lat,stops[i-1].coordinates.lng],p],{color:s.pending?'#ce704c':'#32685f',weight:3,dashArray:'6 8'}).addTo(layer.current);
    });
    connections.filter(hasPoint).forEach(c=>{const p=[c.coordinates.lat,c.coordinates.lng];bounds.push(p);const text=document.createElement('span');text.textContent=c.title;L.circleMarker(p,{radius:6,color:'#a35c3f',fillOpacity:1}).bindTooltip(text,{permanent:true,direction:'top',offset:[0,-12]}).addTo(layer.current);});
    if(value){bounds.push([value.lat,value.lng]);L.circleMarker([value.lat,value.lng],{radius:9,color:'#c76645'}).addTo(layer.current);}
    if(bounds.length)map.fitBounds(bounds,{padding:[40,40],maxZoom:15});
    else map.setView([22.5,79],5);
  },[geometry,point,connectionKey]);
  useEffect(()=>{const stop=stops.find(s=>s.item_id===selected);if(hasPoint(stop||{}))instance.current?.panTo([stop.coordinates.lat,stop.coordinates.lng]);},[selected]);
  return <><div ref={host} className="cm-map" aria-label="Activity locations on OpenStreetMap"/>{error&&<p role="status">{error}</p>}</>;
}

export default function TripMap({ items, pending, branches, day, timezone, onOpen }) {
  const [path,setPath]=useState(''),[preview,setPreview]=useState(false),[selected,setSelected]=useState(null),[expanded,setExpanded]=useState(true);
  const active=branches.filter(b=>b.starts_at && localParts(b.starts_at,timezone).date<=day && localParts(b.rejoin_at,timezone).date>=day);
  const branch=active.find(b=>b.branch_id===path);
  const route=dayRoute(items,branches,branch?.branch_id,day,timezone);
  const proposed=preview?dayRoute(pending,branches,branch?.branch_id,day,timezone):[];
  const stops=[...route,...proposed].sort((a,b)=>Date.parse(a.starts_at)-Date.parse(b.starts_at));
  const links=googleLinks(route),missing=route.filter(a=>!hasPoint(a));
  const connections=branch?[{...items.find(i=>i.item_id===branch.source_item_id),title:'Split here'}, {...items.find(i=>i.item_id===branch.rejoin_item_id),title:'Rejoin here'}]:[];
  const select=s=>{setSelected(s.item_id);setExpanded(true);};
  return <div className="cm-root">
    <div className="cm-controls"><label>Path<select value={branch?.branch_id||''} onChange={e=>{setPath(e.target.value);setSelected(null);}}><option value="">Main plan</option>{active.map(b=><option key={b.branch_id} value={b.branch_id}>{'↳ '.repeat(b.depth||1)}{b.title}</option>)}</select></label><label><input type="checkbox" checked={preview} onChange={e=>setPreview(e.target.checked)}/> Preview proposals</label></div>
    <p className="cm-hint">Stops in scheduled order. Dotted lines connect locations; they are not roads or directions.</p>
    <div className="cm-layout"><MapCanvas stops={stops} onSelect={select} selected={selected} connections={connections}/><aside className={`cm-stops ${expanded?'expanded':''}`}>
      <button className="cm-sheet-toggle" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}>{stops.length} stops · {branch?.title||'Main plan'} {expanded?'⌄':'⌃'}</button>
      <div className="cm-sheet-content">
      {branch&&<p className="cm-connection">Split: {items.find(i=>i.item_id===branch.source_item_id)?.title||timeString(localParts(branch.starts_at,timezone).minutes)}<br/>Rejoin: {items.find(i=>i.item_id===branch.rejoin_item_id)?.title||branch.rejoin_note}{branch.needs_review&&<strong> · Connections need organizer review</strong>}</p>}
      {!stops.length&&<p>No activities for this day yet.</p>}
      {stops.map((s,i)=><button key={s.item_id} className={`cm-stop ${selected===s.item_id?'selected':''}`} onClick={e=>{select(s);onOpen(s,e);}}><span className="cm-number">{i+1}</span><span><small>{timeString(localParts(s.starts_at,timezone).minutes)}{s.pending?' · PROPOSED':''}</small><strong>{s.title}</strong><small>{hasPoint(s)?s.location||'Pinned location':'Location needed'}</small></span></button>)}
      {selected&&<button className="wm-secondary" onClick={e=>{const s=stops.find(s=>s.item_id===selected);if(s)onOpen(s,e);}}>Open selected activity</button>}
      {missing.length>0&&<p className="cm-hint">{missing.length} stops need locations and cannot be sent to Google Maps: {missing.map(s=>s.title).join(', ')}.</p>}
      {links.map((l,i)=><a className="wm-secondary cm-export" key={l.url} href={l.url} target="_blank" rel="noopener noreferrer">Open in Google Maps{links.length>1?` · Part ${i+1}`:''} ↗<small>{l.stops[0].title} → {l.stops.at(-1).title}</small></a>)}
      {preview&&<p className="cm-hint">Google Maps links include confirmed stops only.</p>}
      </div></aside></div>
  </div>;
}
