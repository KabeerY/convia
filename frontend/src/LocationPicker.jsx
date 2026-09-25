import React, {useState} from 'react';
import {MapCanvas} from './TripMap';
import {auth} from './lib/session';
import {core} from './lib/api';
import {cityCenter} from './data/cities';
const noStops=[];
export default function LocationPicker({tripId,cityId,label,onLabel,value,onChange}) {
 const [results,setResults]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[show,setShow]=useState(!!value);
 async function search(){setBusy(true);setError('');try{const {data}=await auth.auth.getSession();const found=await core(`/trips/${encodeURIComponent(tripId)}/places?q=${encodeURIComponent(label)}`,{token:data.session?.access_token});setResults(found);if(!found.length)setError('No places found. Try adding the city, or choose a pin.');setShow(true);}catch{setError('Search is unavailable. You can still choose a point on the map.');setShow(true);}finally{setBusy(false);}}
 return <div className="cm-picker"><label>Location or city<input value={label} maxLength={160} placeholder="Place name and city" onChange={e=>{onLabel(e.target.value);onChange(null);}}/></label><div><button type="button" className="wm-secondary" disabled={busy||label.trim().length<3} onClick={search}>{busy?'Searching…':'Search places'}</button> <button type="button" className="wm-secondary" onClick={()=>setShow(!show)}>Choose a pin</button></div>{error&&<p role="status">{error}</p>}<div className="cm-location-results">{results.map(r=><button type="button" key={`${r.lat},${r.lng}`} onClick={()=>{onLabel(r.label.slice(0,160));onChange({lat:r.lat,lng:r.lng});setResults([]);}}>{r.label}</button>)}</div>{show&&<><p className="cm-hint">Pan and zoom, then tap the exact location. Search results © OpenStreetMap contributors.</p><MapCanvas stops={noStops} value={value} center={cityCenter(cityId)} onPick={onChange}/></>}{value&&<small>Pin: {value.lat.toFixed(5)}, {value.lng.toFixed(5)} <button type="button" onClick={()=>onChange(null)}>Clear</button></small>}</div>;
}
