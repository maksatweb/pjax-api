---
layout: bootstrap
title: Load Balancer
type: page
nav: nav
class: style-info
---

# Load Balancer
ルーターやロードバランサ不要のロードバランス機能をクライアントサイドで実現します。

回線帯域やセッション数といった高額で分散しにくいリソースをサーバーの追加のみで安価にスケールアウトできます。

効果はブラウザ比率に依存するため限定的ですが30～150%(1.3-2.5倍)程度の回線帯域の増設・分散効果が見込めます。ロードバランサなどの高額なネットワーク機器と大容量回線が不要であるためこのコストも削減できます。

もちろんアドレスバーのURLはすべてのサーバーで共通です。

**実験的な機能であり動作検証中です。不具合やご意見等ありましたらお寄せください。**

## 概要

* ロードバランス機能をクライアントサイドで実装
* サーバーの設定が必要
* レスポンスの加工は不要
* 回線帯域を超えるトラフィックを処理可能
* 回遊率の高いサイトで効果的
* 被リンクなどによる回遊でないアクセスには無効
* Chrome、Firefox、Safariのデスクトップ版のみバランス可能
* ウェブサーバとアプリケーションサーバを
* CPU、メモリなどネットワーク以外のリソースのみのスケーリングには通常のロードバランサを使用すべき

## 処理の流れ

1 . [Client] URLに基づきDNSに登録された正規サーバへAjaxリクエスト

2 . [Server] リダイレクト可能なブラウザであればLBサーバまたはAjaxサーバへリダイレクト(ブラウザはAjaxのリダイレクトを認識できない)

3A. [LBServer] 自身がAjaxサーバとなる(他のバランス先がなければLBは不要)

3B. [LBServer] または他のAjaxサーバにバランスする

4 . [AjaxServer] `Access-Control-Allow-Origin`ヘッダと`X-Ajax-Host`ヘッダを追加する

5A. [AjaxServer] 正規サーバへ戻らずAjaxサーバから直接ブラウザへレスポンスを返す

5B: [AjaxServer] 往路でLBサーバを経由している場合は復路もLBサーバを経由してレスポンスを返す

6 . [Client] Ajaxレスポンスによりページ遷移

7 . [Client] `X-Ajax-Host`ヘッダのサーバーをバランス先としてクライアントで登録

8 . [Client] 次回以降サイト内ページ遷移は登録されたサーバーのうちもっとも高速なものへ直接リクエストする

9 . [Client] ブラウザキャッシュの有効期限内のリクエストは前回と同じサーバーへリクエストする

```
 INTERNET(BROWSER)  <===================================
       | A                    | |                    | |
       | |Standard            | | Ajax               | | Ajax
       | |Ajax                | |                    | |
       V |                    | V                    | V
     Regular              LB and Ajax               Ajax
   ___________            ___________            ___________
  |           |          |           |          |           |
  |           | redirect |   [L B]   |  balance |           |
  |   [WEB]   |   -->    |   [WEB]   |    <--   |   [WEB]   |
  |   [APP]   |          |   [APP]   |    -->   |   [APP]   |
  |___________|          |___________|          |___________|

        A                      A                      A
        |                      |                      |
        |                      V                      |
        |                 ___________                 |
        |                |           |                |
        ---------------> |   [D B]   | <---------------
                         |___________|
```

## サーバー設定
サーバーでAjaxリクエストを振り分ける必要があります。振り分け先のサーバーは個別のグローバルIPと回線を持つものを用意する必要があります。通信の設定と流れは以下の通りです。

1. `X-Requested-With: XMLHttpRequest`ヘッダによりAjaxリクエストを識別
2. Cookieの`balance=1`フラグによりバランスするリクエストを識別
3. バランスするAjaxリクエストをウェブサーバのソフトウェアロードバランサなどで302リダイレクト
4. レスポンスヘッダに`Access-Control-Allow-Origin: <site-hostname>`を追加
5. レスポンスヘッダに`X-Ajax-Host: <ajax-hostname>`を追加

## クライアント設定
pjaxの設定によりクライアント側でAjaxリクエストを振り分けることができます。サーバーでのみバランスさせる場合は設定は不要です。リクエスト先はその時点でもっとも高速なサーバーが自動的に選択されます。ダウンなどにより通信エラーが発生したサーバーは一定時間リクエスト先から除外されます。リクエストヘッダを追加できないことに注意してください。

[API: balance](api/core/setting/balance/)

<pre class="sh brush: js;">
$.pjax({
  balance: {
    self: true
  }
});
</pre>

<pre class="sh brush: js;">
$.preload({
  balance: {
    host: $.pjax.host
  }
});
</pre>