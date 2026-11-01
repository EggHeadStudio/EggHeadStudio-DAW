import {createServer} from 'node:http';
import {readFile,writeFile} from 'node:fs/promises';
import {extname,resolve,sep} from 'node:path';

const root=resolve(process.argv[2]||'dist'),capture=process.argv[3],port=Number(process.argv[4]||8787);
const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.wav':'audio/wav','.webmanifest':'application/manifest+json','.png':'image/png'};
createServer(async(request,response)=>{
  response.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:8786');
  try{
    if(request.method==='POST'&&request.url==='/qa-capture'&&capture){
      const chunks=[];let size=0;
      for await(const chunk of request){size+=chunk.length;if(size>16*1024*1024)throw new Error('Test capture exceeds 16 MiB.');chunks.push(chunk)}
      await writeFile(resolve(capture),Buffer.concat(chunks));response.end('Captured test archive.');return;
    }
    if(request.method!=='GET'){response.writeHead(405);response.end();return}
    const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname),path=resolve(root,`.${pathname.endsWith('/')?`${pathname}index.html`:pathname}`);
    if(!path.startsWith(root+sep)){response.writeHead(403);response.end();return}
    const bytes=await readFile(path);response.setHeader('Content-Type',types[extname(path)]||'application/octet-stream');response.setHeader('Cache-Control','no-store');response.end(bytes);
  }catch(error){console.error(error.message);response.writeHead(error.code==='ENOENT'?404:500);response.end('QA server request failed.')}
}).listen(port,'127.0.0.1',()=>console.log(`Disposable QA server: http://127.0.0.1:${port}`));
