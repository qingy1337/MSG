const {Worker}=require('node:worker_threads');
class NavigationService {
  constructor(){this.version=0;this.nextId=0;this.pending=new Map();this.worker=null;this.sent=0;}
  configure(map,walls){this.version++;this.pending.clear();this.floor={type:'floor',version:this.version,map:structuredClone(map),walls:structuredClone(walls)};
    if(this.worker)this.worker.postMessage(this.floor);
  }
  beginTick(){this.sent=0;}
  request(bot,goal,complete,fallbackGoal=null){if(this.sent>=2||this.pending.size>=2||[...this.pending.values()].some(p=>p.bot===bot.id))return false;
    if(!this.worker){
      this.worker=new Worker(require.resolve('./navigationWorker'));
      this.worker.on('message',result=>{const pending=this.pending.get(result.id);this.pending.delete(result.id);
        if(result.version===this.version&&pending){if(result.error)console.error('Navigation search failed:',result.error);pending.complete(result.path);}
      });
      this.worker.on('error',error=>{console.error('Navigation worker failed:',error);this.pending.clear();this.worker=null;});
      this.worker.unref();this.worker.postMessage(this.floor);
    }
    const id=++this.nextId;this.pending.set(id,{bot:bot.id,complete});this.sent++;
    this.worker.postMessage({id,version:this.version,
      start:{x:bot.x,y:bot.y,height:bot.height||0,...(bot.zone?{zone:bot.zone}:{})},
      goal:{x:goal.x,y:goal.y,height:goal.height,...(goal.zone?{zone:goal.zone}:{})},
      ...(fallbackGoal?{fallbackGoal:{x:fallbackGoal.x,y:fallbackGoal.y,
        height:fallbackGoal.height,...(fallbackGoal.zone?{zone:fallbackGoal.zone}:{})}}:{}),
      ogre:bot.botType==='ogre'||bot.botType==='guardian'});return true;
  }
  close(){this.pending.clear();if(this.worker){void this.worker.terminate();this.worker=null;}}
}
module.exports={NavigationService};
