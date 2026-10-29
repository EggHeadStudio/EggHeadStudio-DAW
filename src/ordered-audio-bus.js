// Native multi-input summation order is unspecified. Pairwise unity sums keep
// offline polyphony repeatable without replacing or resetting downstream DSP.
export function createOrderedAudioBus(context,destination){
  const entries=[];let disposed=false;
  return{
    addInput(){
      if(disposed)throw new Error('Cannot add an input to a disposed audio bus.');
      // Reusing idle slots bounds allocation by peak polyphony, not song length.
      let entry=entries.find(entry=>!entry.active);
      if(!entry){
        entry={node:context.createGain(),active:false};entry.node.gain.value=1;
        const previous=entries.at(-1);
        if(previous){previous.node.disconnect(destination);previous.node.connect(entry.node)}
        entry.node.connect(destination);entries.push(entry);
      }
      entry.active=true;let released=false;
      return{input:entry.node,disconnect(){if(!released){released=true;entry.active=false}}};
    },
    disconnect(){
      disposed=true;
      for(const entry of entries)entry.node.disconnect();
      entries.length=0;
    }
  };
}
