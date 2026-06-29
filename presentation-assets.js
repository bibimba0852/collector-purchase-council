// 8bit評議会演出用の素材対応表です。
// 購入前審議の演出モーダルが、この定義から評議会モード別の画像・演出・審議中テキストを参照します。
// 画像パスは index.html から見た相対パスで管理します。

const PRESENTATION_ASSETS = {
  councilModes: {
    "通常審議モード": {
      image: "assets/council/app/normal_01.webp",
      effectPreset: "normal",
      progressLines: [
        "評議会、開廷……",
        "評議中……ゴニョゴニョ……",
        "購入申請を審査中……",
        "判決が出ました"
      ]
    },
    "財務省モード": {
      image: "assets/council/app/finance_01.webp",
      effectPreset: "finance",
      progressLines: [
        "財務査定、開始……",
        "予算影響を確認中……",
        "支出妥当性を審査中……",
        "査定結果が出ました"
      ]
    },
    "肯定モード": {
      image: "assets/council/app/sweet_01.webp",
      effectPreset: "sweet",
      progressLines: [
        "肯定評議会、にこやかに開廷……",
        "いいんじゃない？の声が多数……",
        "買って幸せになる可能性を確認中……",
        "前向きな判決が出ました"
      ]
    },
    "オタク友達モード": {
      image: "assets/council/app/otaku_friend_01.webp",
      effectPreset: "otaku",
      progressLines: [
        "ねぇねぇこれ買おうと思うんだけど……",
        "それはアリでは？",
        "沼の入口で最終確認中……",
        "友人たちの結論が出ました"
      ]
    },
    "未来の自分モード": {
      image: "assets/council/app/future_self_01.webp",
      effectPreset: "future",
      progressLines: [
        "机の中から自分が！",
        "数か月後の満足度を語っている……",
        "後悔ルートも語ってる！？",
        "未来からの助言が届きました"
      ]
    },
    "秘密結社モード": {
      image: "assets/council/app/secret_society_01.webp",
      effectPreset: "secret",
      progressLines: [
        "秘儀評議会、開廷……",
        "黒き判定板がざわめく……",
        "物欲の儀式審問中……",
        "秘儀の判決が下りました"
      ]
    },
    "銀河系騎士団モード": {
      image: "assets/council/app/knight_order_01.webp",
      effectPreset: "knight",
      progressLines: [
        "評議会は私を攻めている……",
        "購買価値を審査中……",
        "戦利品としての誉れを確認中……",
        "評議会の裁定が下りました"
      ]
    },
    "社内稟議モード": {
      image: "assets/council/app/absurd_lecture_01.webp",
      effectPreset: "absurd",
      progressLines: [
        "社内稟議会議を開始します",
        "なぜ買うのか詰問中……",
        "言い訳の余地を確認中……",
        "理不尽な結論が出ました"
      ]
    }
  }
};
