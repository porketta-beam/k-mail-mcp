// 헤더 기반 신호 재현 테스트 — 픽스처는 모두 가짜 데이터입니다.
import { test } from "node:test";
import assert from "node:assert/strict";
import { simpleParser } from "mailparser";
import { analyzeMail } from "../app/analyze.js";

const NAVER = ["naver.com"];
const DAUM  = ["daum.net"];

async function mail(headers, body = "본문") {
  const m = await simpleParser([...headers, "Subject: test", "", body].join("\r\n"));
  return (opts = {}) => analyzeMail(m, opts);
}

// ── auth ─────────────────────────────────────────────
test("네이버: Authentication-Results 의 SPF/DKIM/DMARC 를 모두 읽는다", async () => {
  const r = (await mail([
    "From: a@shop.example.com",
    "ARC-Authentication-Results: i=1; mx.naver.com; spf=pass smtp.mailfrom=shop.example.com; dkim=pass; dmarc=pass",
    "Authentication-Results: mx.naver.com; spf=pass smtp.mailfrom=shop.example.com;",
    " dkim=pass header.i=@shop.example.com; dmarc=pass (p=NONE) header.from=shop.example.com",
  ]))({ trustedAuthDomains: NAVER });
  assert.equal(r.auth, "SPF:pass | DKIM:pass | DMARC:pass");
});

test("Authentication-Results 가 여러 개면 모두 합쳐 DMARC 를 놓치지 않는다", async () => {
  const r = (await mail([
    "From: a@pay.example.com",
    "Authentication-Results: mx.naver.com; spf=pass smtp.mailfrom=pay.example.com; dkim=pass",
    "Authentication-Results: mx.naver.com; dmarc=pass header.from=pay.example.com",
  ]))({ trustedAuthDomains: NAVER });
  assert.equal(r.auth, "SPF:pass | DKIM:pass | DMARC:pass");
});

test("다음: Authentication-Results 가 없으면 Received-SPF 로 SPF 를 읽는다", async () => {
  const r = (await mail([
    "From: mail@loan.example.kr",
    "Received-SPF: pass (mx.daum.net: domain of mail@loan.example.kr designates 192.0.2.1 as permitted sender)",
  ]))({ trustedAuthDomains: DAUM });
  assert.equal(r.auth, "SPF:pass");
});

test("인증 헤더가 전혀 없으면 '인증헤더없음'", async () => {
  const r = (await mail(["From: noreply@corp.example.com"]))({ trustedAuthDomains: NAVER });
  assert.equal(r.auth, "인증헤더없음");
});

test("수신 서버 헤더는 있는데 결과값이 없으면 '인증헤더 해석실패'", async () => {
  const r = (await mail([
    "From: a@example.com",
    "Authentication-Results: mx.naver.com; none",
  ]))({ trustedAuthDomains: NAVER });
  assert.equal(r.auth, "인증헤더 해석실패");
});

test("발신자가 끼워 넣은 다른 서버의 Authentication-Results 는 무시한다", async () => {
  const r = (await mail([
    "From: security@bank.example.com",
    "Authentication-Results: mx.attacker.example.net; spf=pass; dkim=pass; dmarc=pass",
  ]))({ trustedAuthDomains: NAVER });
  assert.equal(r.auth, "인증헤더없음");
});

// ── replyToDiffers ───────────────────────────────────
test("등록 도메인이 다르면 replyToDiffers=true, 고객지원 서비스는 따로 표시", async () => {
  const r = (await mail([
    "From: \"VPN\" <hello@news.vpn-example.com>",
    "Reply-To: support-em-mkt@vpn-example.zendesk.com",
  ]))();
  assert.equal(r.replyToDiffers, true);
  assert.equal(r.replyToKnownService, "zendesk.com");
});

test("알 수 없는 도메인으로 답장을 유도하면 replyToKnownService=null", async () => {
  const r = (await mail([
    "From: security@bank.example.com",
    "Reply-To: help@bank-example.net",
  ]))();
  assert.equal(r.replyToDiffers, true);
  assert.equal(r.replyToKnownService, null);
});

test("서브도메인 차이는 정상: github.com ↔ reply.github.com", async () => {
  const r = (await mail([
    "From: notifications@github.com",
    "Reply-To: reply+ABC123@reply.github.com",
  ]))();
  assert.equal(r.replyToDiffers, false);
});

test("2단계 국가 도메인: a.shop.co.kr ↔ b.shop.co.kr 는 같고, shop.co.kr ↔ other.co.kr 는 다르다", async () => {
  assert.equal((await mail(["From: x@a.shop.co.kr", "Reply-To: y@b.shop.co.kr"]))().replyToDiffers, false);
  assert.equal((await mail(["From: x@shop.co.kr", "Reply-To: y@other.co.kr"]))().replyToDiffers, true);
});

test("표시 이름 속 @ 에 속지 않는다", async () => {
  const r = (await mail([
    "From: \"help@other.example.net\" <a@example.com>",
    "Reply-To: b@mail.example.com",
  ]))();
  assert.equal(r.replyToDiffers, false);
});

