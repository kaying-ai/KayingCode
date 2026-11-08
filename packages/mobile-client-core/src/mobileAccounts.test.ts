import { expect, test } from "vitest";
import { addMobileAccount, listMobileAccounts, removeMobileAccount, exportMobileAccounts, importMobileAccounts } from "./mobileAccounts.js";
import { defaultRelayPlatformPorts } from "./relayPlatform.js";
function ports() { const values = new Map<string,string>(); return {...defaultRelayPlatformPorts, storage:{ getItem:(key:string)=>values.get(key)??null, setItem:(key:string,value:string)=>{values.set(key,value)}, removeItem:(key:string)=>{values.delete(key)}}}; }
const web = (sid:string, secret="a") => `https://relay.example.com/remote/v4?sid=${sid}#authorize=${secret.repeat(43)}`;
test("current Web device identity deduplicates fresh invitations without replacing another device", () => {
  const p = ports(); const a = addMobileAccount(web("one"),undefined,p)!;
  expect(addMobileAccount(web("one","b"),undefined,p)?.id).toBe(a.id);
  expect(addMobileAccount(web("two"),undefined,p)?.id).not.toBe(a.id);
  expect(listMobileAccounts(p)).toHaveLength(2);
  removeMobileAccount(a.id,p);expect(listMobileAccounts(p)).toHaveLength(1);
});
test("exports retain V2 profiles and reject retired connection formats on import", () => {
  const p=ports();addMobileAccount(web("one"),undefined,p);
  const target=ports();expect(importMobileAccounts(exportMobileAccounts(p),target)).toBe(1);
  expect(importMobileAccounts(exportMobileAccounts(p),target)).toBe(0);
  expect(addMobileAccount("https://relay.example.com#pairing#secret",undefined,target)).toBeNull();
});
