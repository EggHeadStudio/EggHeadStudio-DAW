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
 const assets=(await Promise.all(['src','vendor'].map(directory=>filesIn(join(source,directory))))).flat().sort();
 const hash=createHash('sha256').update(template),payloads=[];
 for(const path of assets){
  const name=relative(source,path).split('\\').join('/');
  const bytes=await readFile(path);
  hash.update(`\0${name}\0`).update(bytes);
  payloads.push({path:relative(source,path),bytes});
 }
 const version=hash.digest('hex').slice(0,20),prefix=`./assets/${version}/`;
 const html=template.replace(/(["'])\.\/src\//g,`$1${prefix}src/`).replace('</head>',`  <meta name="ehs-build" content="${version}" />\n  </head>`);
 if(!html.includes(`${prefix}src/app.js`))throw new Error('Application entry point was not versioned.');
 await mkdir(join(output,'assets',version),{recursive:true});
 for(const payload of payloads){
  const target=join(output,'assets',version,payload.path);
  await mkdir(dirname(target),{recursive:true});await writeFile(target,payload.bytes);
 }
 await writeFile(join(output,'index.html'),html);
 await writeFile(join(output,'version.json'),`${JSON.stringify({version})}\n`);
 await writeFile(join(output,'.nojekyll'),'');
 return{version,assets:assets.length,output};
}

if(process.argv[1]&&pathToFileURL(resolve(process.argv[1])).href===import.meta.url){
 console.log(JSON.stringify(await buildStatic()));
}
