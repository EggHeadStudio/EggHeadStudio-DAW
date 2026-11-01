import {mkdir,writeFile} from 'node:fs/promises';
import {FACTORY_SAMPLES,factoryWav} from './factory-sample-dsp.mjs';
for(const sample of FACTORY_SAMPLES){
  const directory=new URL(`../assets/factory-samples/${sample.category}/`,import.meta.url);
  await mkdir(directory,{recursive:true});
  await writeFile(new URL(sample.name.replaceAll(' ','-').toLowerCase(),directory),factoryWav(sample));
}
console.log(`Generated ${FACTORY_SAMPLES.length} original deterministic mono WAV samples.`);
