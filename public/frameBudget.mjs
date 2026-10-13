// Conservative resolution scaling; lighting and gameplay remain unchanged.
export class FrameBudget {
  constructor(){this.levels=[0.65,0.8,1,1.25];this.level=2;this.elapsed=0;this.count=0;this.average=16.67;this.cooldown=2;this.fastTime=0;}
  get scale(){return this.levels[this.level];}
  sample(ms){
    if(!Number.isFinite(ms)||ms<=0||ms>250)return false;
    this.average+=(ms-this.average)*0.05;
    const seconds=ms/1000;this.cooldown=Math.max(0,this.cooldown-seconds);
    this.elapsed+=seconds;this.count++;
    if(this.average<17.5)this.fastTime+=seconds;else this.fastTime=0;
    if(this.cooldown>0)return false;
    if(this.average>22&&this.level>0){this.level--;this.cooldown=3;this.fastTime=0;return true;}
    if(this.fastTime>8&&this.level<this.levels.length-1){this.level++;this.cooldown=5;this.fastTime=0;return true;}
    return false;
  }
}
