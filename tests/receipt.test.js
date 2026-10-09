import test from 'node:test';
import assert from 'node:assert/strict';
import {parseFuelReceipt} from '../receipt.js';

test('extracts supported fields from a typical Taiwan fuel receipt',()=>{
  assert.deepEqual(parseFuelReceipt('交易日期 2026/10/09\n油品 92 無鉛\n公升數 32.58 L\n單價 29.5\n實付金額 961 元'),{
    date:'2026-10-09',category:'92 無鉛',liters:32.58,unitPrice:29.5,cost:961,odometer:null
  });
});
test('does not guess amounts or odometer from unlabeled numbers',()=>{
  const parsed=parseFuelReceipt('發票 AB 12345678\n車號 92-AB\n日期 115.10.09\n柴油\n總金額 1,234');
  assert.equal(parsed.date,'2026-10-09');
  assert.equal(parsed.category,'柴油');
  assert.equal(parsed.cost,1234);
  assert.equal(parsed.liters,null);
  assert.equal(parsed.odometer,null);
});
