export function saveProjectSnapshot(storage,serialized,recovery=null){
 if(recovery)storage.setItem(recovery.key,recovery.serialized);
 storage.setItem('pulse-project',serialized);
}
