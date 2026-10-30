import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import {dirname,join,relative,resolve} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

async function filesIn(directory){
 const result=[];
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory())result.push(...await filesIn(path));
  else if(entry.isFile())result.push(path);
  else throw new Error(`Unsupported deployment asset: ${path}`);
 }
 return result;
}

export async function buildStatic({source=root,output=join(root,'dist')}={}){
 source=resolve(source);output=resolve(output);
 if(output===source||!relative(source,output))throw new Error('Deployment output must not replace the source directory.');
 const template=await readFile(join(source,'index.html'),'utf8');
 const manifestPath=join(source,'manifest.webmanifest');
 const manifest=await readFile(manifestPath);
 const manifestData=JSON.parse(manifest.toString('utf8'));
 const buildScript=await readFile(fileURLToPath(import.meta.url));
 const icons=['icon-192.png','icon-512.png','icon-maskable-512.png','apple-touch-icon.png','icon-1024.png']
  .map(name=>({name,path:join(source,'icons',name)}));
 if(!template.includes('href="./manifest.webmanifest"')||!template.includes('href="./icons/apple-touch-icon.png"'))
  throw new Error('HTML must link the PWA manifest and Apple touch icon.');
 if(!Array.isArray(manifestData.icons)||manifestData.display!=='standalone')
  throw new Error('PWA manifest must declare standalone display and app icons.');
 for(const icon of manifestData.icons){
  if(icon.type!=='image/png'||!icon.src?.startsWith('./icons/')||!icons.some(asset=>`./icons/${asset.name}`===icon.src))
   throw new Error(`PWA manifest references an unsupported or unbundled icon: ${icon.src}`);
 }
 const workerTemplate=await readFile(join(source,'scripts','service-worker-template.js'),'utf8');
 const assets=(await Promise.all(['src','vendor'].map(directory=>filesIn(join(source,directory))))).flat().sort();
 const hash=createHash('sha256').update(template).update('\0scripts/build-static.mjs\0').update(buildScript)
  .update('\0manifest.webmanifest\0').update(manifest)
  .update('\0service-worker-template.js\0').update(workerTemplate),payloads=[];
 for(const path of assets){
  const name=relative(source,path).split('\\').join('/');
  const bytes=await readFile(path);
  hash.update(`\0${name}\0`).update(bytes);
  payloads.push({path:relative(source,path),bytes});
 }
 const iconPayloads=[];
 for(const icon of icons){
  const bytes=await readFile(icon.path);
  hash.update(`\0icons/${icon.name}\0`).update(bytes);
  iconPayloads.push({path:icon.name,bytes});
 }
 const version=hash.digest('hex').slice(0,20),prefix=`./assets/${version}/`;
 const html=template.replace(/(["'])\.\/src\//g,`$1${prefix}src/`).replace('</head>',`  <meta name="ehs-build" content="${version}" />\n  </head>`);
 if(!html.includes(`${prefix}src/app.js`))throw new Error('Application entry point was not versioned.');
 const shellUrls=['./','./manifest.webmanifest','./version.json',...icons.map(icon=>`./icons/${icon.name}`),
  ...payloads.map(payload=>`${prefix}${payload.path.split('\\').join('/')}`)];
 const serviceWorker=workerTemplate
  .replaceAll('__EHS_BUILD_VERSION__',version)
  .replace('__EHS_SHELL_URLS__',JSON.stringify(shellUrls));
 if(serviceWorker.includes('__EHS_'))throw new Error('Service worker template contains an unresolved build token.');
 await mkdir(join(output,'assets',version),{recursive:true});
 for(const payload of payloads){
  const target=join(output,'assets',version,payload.path);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,payload.bytes);
 }
 for(const icon of iconPayloads){
  const target=join(output,'icons',icon.path);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,icon.bytes);
 }
 await writeFile(join(output,'index.html'),html);
 await writeFile(join(output,'manifest.webmanifest'),manifest);
 await writeFile(join(output,'service-worker.js'),serviceWorker);
 await writeFile(join(output,'version.json'),`${JSON.stringify({version})}\n`);
 await writeFile(join(output,'.nojekyll'),'');
 return{version,assets:assets.length,output};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 console.log(JSON.stringify(await buildStatic()));
}
