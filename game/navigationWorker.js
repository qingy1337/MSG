const {parentPort}=require('node:worker_threads');
const {NavigationGraph}=require('./navigation');
let floor,graphs=new Map();
parentPort.on('message',message=>{
  if(message.type==='floor'){floor=message;graphs.clear();return;}
  if(!floor||message.version!==floor.version)return;
  try {
    const key=!!message.ogre;
    if(!graphs.has(key))graphs.set(key,new NavigationGraph(floor.map,floor.walls,key));
    const graph=graphs.get(key),path=graph.findWithFallback(message.start,message.goal,message.fallbackGoal);
    parentPort.postMessage({id:message.id,version:message.version,path});
  } catch(error){parentPort.postMessage({id:message.id,version:message.version,path:[],error:error.message});}
});
