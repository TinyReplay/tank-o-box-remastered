import * as T from 'three';
const cameraRotation=new T.Quaternion();
const local=new T.Matrix4(),desired=new T.Matrix4(),rotation=new T.Matrix4();
const position=new T.Vector3(),scale=new T.Vector3();
export function faceBillboards(root,camera){
 camera.getWorldQuaternion(cameraRotation);root.updateMatrixWorld(true);
 root.traverseVisible(node=>{
  if(!node.userData.billboard||!node.parent)return;
  desired.makeRotationFromQuaternion(cameraRotation);
  local.copy(node.parent.matrixWorld).invert().multiply(desired);
  local.decompose(position,node.quaternion,scale);
  node.scale.x=Math.abs(node.scale.x)*(scale.x<0?-1:1);node.updateMatrixWorld(true);
 });
}
const bonusNames=new Set(['upgrade','speedup','shieldtank','shieldshtab','airstrike','timestop']);
export function hideCollectedBonus(root){root?.traverse(node=>{if(bonusNames.has(node.name))node.visible=false;});}
