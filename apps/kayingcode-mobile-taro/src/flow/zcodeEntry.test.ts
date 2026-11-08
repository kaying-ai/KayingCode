import assert from "node:assert/strict";
import test from "node:test";
import { nativeZcodeHomeUrl, readNativeZcodeAccountId, zcodeEntryMode } from "./zcodeEntry";

test("微信明确走原生协议，H5 保持网页入口，不根据加载错误切换", () => {
  assert.equal(zcodeEntryMode("weapp"), "native");
  assert.equal(zcodeEntryMode("h5"), "website");
});

test("设备管理原生入口只传本地 accountId，首页可读取且缺省不选择账户", () => {
  const id = "local-device-1";
  assert.equal(nativeZcodeHomeUrl(id), "/pages/home/index?zcodeAccountId=local-device-1");
  assert.equal(readNativeZcodeAccountId({ zcodeAccountId: id }), id);
  assert.equal(readNativeZcodeAccountId({}), null);
  assert.equal(readNativeZcodeAccountId({ zcodeAccountId: "%invalid" }), null);
  assert.doesNotMatch(nativeZcodeHomeUrl(id), /sid=|token|https|hash=/);
});
