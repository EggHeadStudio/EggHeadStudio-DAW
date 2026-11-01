export function runningBuildIdentity(document,location){
  const version=document.querySelector('meta[name="ehs-build"]')?.content||null;
  const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname);
  return{version,label:version?`${local?'Local build':'Build'} ${version.slice(0,10)}`:`${local?'Local source':'Source'} (unversioned)`,
    diagnostic:version||'Source application; no deterministic build metadata.'};
}

export function mountBuildIdentity(root){
  const identity=runningBuildIdentity(document,location),footer=root.querySelector('footer');
  const output=document.createElement('output');output.className='running-build';output.textContent=identity.label;
  output.title=identity.diagnostic;output.setAttribute('aria-label',`Running application: ${identity.diagnostic}`);
  footer.append(output);
}
