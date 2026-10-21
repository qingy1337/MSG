export class InputPrediction {
  constructor(){this.sequence=0;this.reset(0);}
  reset(time){this.pending=[];this.sent=0;this.time=time;}
  record(dx,dy,dt,jump,epoch){
    const input={seq:++this.sequence,dx,dy,dt,jump:!!jump,epoch:epoch||0};
    this.pending.push(input);
    // Bound memory during a stalled connection. A lost history forces a rebase.
    if(this.pending.length>240)this.pending.shift();
    return input;
  }
  outgoing(){const batch=this.pending.filter(p=>p.seq>this.sent).slice(0,32);if(batch.length)this.sent=batch.at(-1).seq;return batch;}
  reconcile(authoritative,predicted,serverNow,apply,prepare=()=>{}){
    const previousTime=this.time;
    const ack=authoritative.lastProcessedInput||0;
    const epoch=authoritative.movementEpoch||0;
    this.pending=this.pending.filter(p=>p.seq>ack&&p.epoch===epoch);
    this.time=serverNow;
    // A new impact epoch invalidates commands authored before the impulse, but
    // residual velocity no longer locks movement. Once epochs agree, replay
    // fresh directional input alongside the authoritative impact motion.
    if(!authoritative.alive||(predicted?.movementEpoch||0)!==epoch){this.pending=[];return;}
    // Moving terrain must be sampled at the client's current platform phase,
    // before replay. An old lift height against a newer collider creates a fall.
    prepare(authoritative);
    for(const input of this.pending){this.time+=input.dt*1000;apply(authoritative,input,this.time);}
    // An acknowledged jump keeps its locally predicted phase. Snapshot receipt
    // time is not a new takeoff clock. Still accept changed ground/ceilings and
    // authoritative knockback/floor resets rather than hiding real corrections.
    const sameJump=predicted?.jumpInputSeq!=null&&authoritative.jumpInputSeq===predicted.jumpInputSeq;
    const sameSurface=Math.abs((authoritative.groundHeight||0)-(predicted?.groundHeight||0))<0.025&&
      authoritative.ceilingHeight===predicted?.ceilingHeight;
    if(sameJump&&sameSurface&&(authoritative.jumpStartedAt!=null||predicted.jumpStartedAt!=null)){
      for(const key of ['height','jumpBase','jumpVelocity','jumpInputSeq'])authoritative[key]=predicted[key];
      authoritative.jumpStartedAt=predicted.jumpStartedAt==null?null:predicted.jumpStartedAt+this.time-previousTime;
    }
  }
}
