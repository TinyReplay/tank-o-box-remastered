import * as T from 'three';
const cameraRotation=new T.Quaternion();
const local=new T.Matrix4(),desired=new T.Matrix4(),rotation=new T.Matrix4();
export function faceBillboards(root,camera){
 camera.getWorldQuaternion(cameraRotation);root.updateMatrixWorld(true);
 root.traverseVisible(node=>{
  if(!node.userData.billboard||!node.parent)return;
  desired.makeRotationFromQuaternion(cameraRotation);
  if(node.parent.matrixWorld.determinant()<0)desired.scale(new T.Vector3(-1,1,1));
  local.copy(node.parent.matrixWorld).invert().multiply(desired);rotation.extractRotation(local);
  node.quaternion.setFromRotationMatrix(rotation);node.updateMatrixWorld(true);
 });
}
const bonusNames=new Set(['upgrade','speedup','shieldtank','shieldshtab','airstrike','timestop']);
export function hideCollectedBonus(root){root?.traverse(node=>{if(bonusNames.has(node.name))node.visible=false;});}
