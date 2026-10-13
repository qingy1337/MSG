// Must stay aligned with the authoritative pellet radius in game/shotgun.js.
export const SHOTGUN_SPREAD_RADIANS=0.085;

export function shotgunReticleDiameter(viewportHeight,verticalFovDegrees=68) {
  if(!Number.isFinite(viewportHeight)||viewportHeight<=0||
    !Number.isFinite(verticalFovDegrees)||verticalFovDegrees<=0||verticalFovDegrees>=180)return 0;
  const focalLength=viewportHeight/(2*Math.tan(verticalFovDegrees*Math.PI/360));
  return 2*focalLength*Math.tan(SHOTGUN_SPREAD_RADIANS);
}
