// ==============================
// 定数
// ==============================

const SETTINGS_STORAGE_KEY = "collectorCouncilSettings";
const ITEMS_STORAGE_KEY = "collectorCouncilItems";
const APP_NAME = "collector-purchase-council";
const DATA_SCHEMA_VERSION = 1;
const DIAGNOSTIC_SCHEMA_VERSION = 2;
const PRE_PURCHASE_REVIEW_VERSION = "v2.2.1";
const POST_PURCHASE_VERSION = "v3.0";
const SKIP_HISTORY_VERSION = "v3.3";
const MARKET_RESEARCH_SCHEMA_VERSION = 1;
const MARKET_RESEARCH_PROMPT_VERSION = "market-research-v1";
const MARKET_RESEARCH_MANUAL_IMPORT_SOURCE = "manual-json-paste";

const COUNCIL_MODES = [
  "通常審議モード",
  "財務省モード",
  "肯定モード",
  "オタク友達モード",
  "未来の自分モード",
  "秘密結社モード",
  "銀河系騎士団モード",
  "社内稟議モード"
];

const LEGACY_COUNCIL_MODES = [
  "ゲロ甘肯定モード",
  "秘密結社風モード",
  "古代騎士団風モード",
  "理不尽説教モード"
];

const VALID_JUDGMENTS = ["買い", "保留", "見送り", "危険な買い"];
const VALID_HISTORY_TYPES = ["review", "purchase", "skip"];
const VALID_ACTION_STATUSES = ["検討中", "購入済み", "見送り済み"];
const VALID_DESIRE_LEVELS = ["高", "中", "低", "かなり低い"];
const VALID_TIMING_LEVELS = ["強い", "普通", "弱い"];
const VALID_RISK_LEVELS = ["低", "注意", "高"];
const VALID_GATE_SOURCES = ["none", "invalid_price", "low_desire", "max_price_over", "budget_over", "price_unknown", "target_wait"];
const VALID_REVIEW_PRICE_STATUS_KEYS = ["baseOrBelow", "nearBase", "slightPremium", "clearPremium", "notComparable"];

const FALLBACK_COUNCIL_MODE = "通常審議モード";
const ITEM_TYPE_OPTIONS = ["予約・発売前", "通常販売中", "品薄・売り切れ気味", "廃盤・終売", "不明"];
const DEFAULT_ITEM_TYPE = "通常販売中";
const PRICE_BASIS_TYPES = ["定価を基準にする", "中古相場を基準にする", "参考相場を基準にする", "基準価格なし・不明"];
const DEFAULT_PRICE_BASIS_TYPE = "定価を基準にする";
const UNKNOWN_PRICE_BASIS_TYPE = "基準価格なし・不明";

const PURCHASE_TYPES = ["定価購入", "セール購入", "プレ値購入", "中古購入", "その他"];
const DEFAULT_SCORE = 5;
const LEGO_CATEGORY_NAME = "LEGO";
const REVIEW_PRESENTATION_DURATION_MS = 4000;
const REVIEW_PRESENTATION_PROGRESS_TIMES_MS = [0, 1200, 2400, 3400];

const APP_TABS = ["cover", "form", "considering", "purchased", "skipped", "settings"];

const CONSIDERING_FILTERS = [
  { key: "all", label: "すべて" },
  { key: "unreviewed", label: "未審議" },
  { key: "buy", label: "買い" },
  { key: "hold", label: "保留" },
  { key: "skipJudgment", label: "見送り判定" },
  { key: "danger", label: "危険な買い" }
];

const COUNCIL_EFFECT_CLASSES = {
  normal: "effect-normal",
  finance: "effect-finance",
  sweet: "effect-sweet",
  otaku: "effect-otaku",
  future: "effect-future",
  secret: "effect-secret",
  knight: "effect-knight",
  absurd: "effect-absurd"
};

const scoreInputIds = [
  "wantScoreInput",
  "regretScoreInput",
  "rarityRiskScoreInput",
  "longEnjoymentScoreInput",
  "spaceRiskScoreInput",
  "overbuyScoreInput",
  "explanationDifficultyScoreInput",
  "backlogRiskScoreInput"
];

// ==============================
// 初期データ
// ==============================

let settings = createDefaultSettings();

let items = [];
let pendingPurchase = null;
let activeTab = "cover";
let itemFormReturnTab = "considering";
let consideringFilter = "all";
let reviewPresentationTimers = [];
let pendingReviewPresentation = null;
let lastAddedItemId = "";
let pendingDraftMarketResearch = null;
let preparedDraftMarketResearch = null;

// ==============================
// localStorage保存/読み込み
// ==============================

function createDefaultSettings() {
  return {
    monthlyBudget: 0,
    budgetStartDate: "",
    budgetEndDate: "",
    defaultCouncilMode: FALLBACK_COUNCIL_MODE,
    heartStock: 0,
    lastExportedAt: "",
    lastImportedAt: ""
  };
}

function loadData() {
  try {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      settings = {
        ...createDefaultSettings(),
        ...JSON.parse(savedSettings)
      };
    }
  } catch (error) {
    console.warn("設定データの読み込みに失敗しました。初期値で起動します。", error);
  }

  settings = normalizeSettings(settings);

  try {
    const savedItems = localStorage.getItem(ITEMS_STORAGE_KEY);
    if (savedItems) {
      const parsedItems = JSON.parse(savedItems);
      items = Array.isArray(parsedItems) ? parsedItems.map(normalizeItem) : [];
    }
  } catch (error) {
    console.warn("商品データの読み込みに失敗しました。空の一覧で起動します。", error);
    items = [];
  }
}

function normalizeSettings(sourceSettings) {
  const defaultPeriod = getDefaultBudgetPeriod();

  return {
    monthlyBudget: toNumber(sourceSettings.monthlyBudget),
    budgetStartDate: sourceSettings.budgetStartDate || defaultPeriod.start,
    budgetEndDate: sourceSettings.budgetEndDate || defaultPeriod.end,
    defaultCouncilMode: getSelectableCouncilMode(sourceSettings.defaultCouncilMode),
    heartStock: Math.max(0, toNumber(sourceSettings.heartStock)),
    lastExportedAt: sourceSettings.lastExportedAt || "",
    lastImportedAt: sourceSettings.lastImportedAt || ""
  };
}

function normalizeItem(item) {
  const hasCurrentPrice = Object.prototype.hasOwnProperty.call(item, "currentPrice");
  const normalized = {
    ...createEmptyItem(),
    ...item,
    itemType: item.itemType || DEFAULT_ITEM_TYPE,
    priceBasisType: item.priceBasisType || DEFAULT_PRICE_BASIS_TYPE,
    // 旧データに currentPrice 自体がない時だけ registeredPrice を補完する。
    // 明示的に保存された 0 は「価格未設定」としてそのまま維持する。
    currentPrice: hasCurrentPrice ? toNumber(item.currentPrice) : toNumber(item.registeredPrice),
    releaseDate: item.releaseDate || "",
    rarityRiskAutoScore: item.rarityRiskAutoScore || 0,
    rarityRiskAutoLevel: item.rarityRiskAutoLevel || 0,
    rarityRiskManualOverride: Boolean(item.rarityRiskManualOverride),
    judgmentHistory: Array.isArray(item.judgmentHistory) ? item.judgmentHistory : [],
    marketResearchHistory: normalizeMarketResearchHistory(item.marketResearchHistory)
  };

  if (!item.scoreScale) {
    scoreInputIds.forEach((inputId) => {
      const scoreKey = inputId.replace("Input", "");
      normalized[scoreKey] = convertLegacyScore(normalized[scoreKey]);
    });
  }

  return {
    ...normalized,
    scoreScale: 10
  };
}

function convertLegacyScore(score) {
  const numericScore = toNumber(score);
  if (numericScore <= 0) return DEFAULT_SCORE;
  if (numericScore <= 5) return Math.min(10, numericScore * 2);
  return Math.min(10, numericScore);
}

function hasPrePurchaseReview(item) {
  return Boolean(
    item &&
    item.judgedAt &&
    VALID_JUDGMENTS.includes(item.judgment)
  );
}

function hasValidMonthlyBudget() {
  return toNumber(settings && settings.monthlyBudget) > 0;
}

function saveSettings() {
  saveData();
}

function saveItems() {
  saveData();
}

function saveData() {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  localStorage.setItem(ITEMS_STORAGE_KEY, JSON.stringify(items));
}

function exportData() {
  const exportedAt = new Date().toISOString();
  settings.lastExportedAt = exportedAt;

  const data = {
    appName: APP_NAME,
    schemaVersion: DATA_SCHEMA_VERSION,
    exportedAt,
    settings,
    items
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `collector-council-backup-${formatBackupFileTimestamp(new Date(exportedAt))}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);

  saveData();
  renderDataManagementStatus();
  alert("データを書き出しました。ブラウザの保存先を確認してください。");
}

async function importData(file) {
  if (!file) return;

  let parsedData;
  try {
    parsedData = JSON.parse(await file.text());
  } catch (error) {
    alert("JSONファイルとして読み込めませんでした。");
    return;
  }

  const validationError = validateImportData(parsedData);
  if (validationError) {
    alert(validationError);
    return;
  }

  const confirmed = confirm("現在のデータをバックアップファイルの内容で上書きします。よろしいですか？");
  if (!confirmed) return;

  settings = normalizeSettings({
    ...createDefaultSettings(),
    ...parsedData.settings,
    lastImportedAt: new Date().toISOString()
  });
  items = parsedData.items.map(normalizeItem);

  saveData();
  resetItemForm();
  hideItemAddedPanel();
  consideringFilter = "all";
  activeTab = "cover";
  renderAll();
  alert("データを読み込みました。");
}

function validateImportData(data) {
  if (!data || typeof data !== "object") {
    return "バックアップファイルの形式が正しくありません。";
  }

  if (data.appName !== APP_NAME) {
    return "このファイルはコレクター購入評議会のバックアップファイルではありません。";
  }

  if (data.schemaVersion !== DATA_SCHEMA_VERSION) {
    return `対応していないバックアップ形式です。schemaVersion ${DATA_SCHEMA_VERSION} のファイルを選んでください。`;
  }

  if (!data.settings || typeof data.settings !== "object" || Array.isArray(data.settings)) {
    return "バックアップファイルに設定データが見つかりません。";
  }

  if (!Array.isArray(data.items)) {
    return "バックアップファイルの商品データが正しくありません。";
  }

  const itemIds = new Set();
  for (let index = 0; index < data.items.length; index += 1) {
    const item = data.items[index];
    const itemNumber = index + 1;

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return `商品データ ${itemNumber} 件目の形式が正しくありません。`;
    }

    if (typeof item.id !== "string" || !item.id.trim()) {
      return `商品データ ${itemNumber} 件目に有効なIDがありません。`;
    }

    if (itemIds.has(item.id)) {
      return `商品データに重複したIDがあります: ${item.id}`;
    }
    itemIds.add(item.id);

    if (typeof item.name !== "string") {
      return `商品データ ${itemNumber} 件目の商品名が正しくありません。`;
    }

    if (item.judgmentHistory !== undefined && !Array.isArray(item.judgmentHistory)) {
      return `商品データ ${itemNumber} 件目の審議履歴が正しくありません。`;
    }

    if (item.marketResearchHistory !== undefined && !Array.isArray(item.marketResearchHistory)) {
      return `商品データ ${itemNumber} 件目のAI相場調査履歴が正しくありません。`;
    }

    for (const booleanField of ["purchased", "skipped"]) {
      if (item[booleanField] !== undefined && typeof item[booleanField] !== "boolean") {
        return `商品データ ${itemNumber} 件目の ${booleanField} が正しくありません。`;
      }
    }
  }

  return "";
}

function createDiagnosticReport() {
  const reportItems = Array.isArray(items) ? items : [];
  const summary = createDiagnosticSummary(reportItems);
  const checks = [];
  const warnings = [];
  const errors = [];

  addDiagnosticEntry(checks, "ok", "VALID_APP_KEYS", "settings と items を読み込めます。");

  if (!settings || typeof settings !== "object" || Array.isArray(settings)) {
    addDiagnosticEntry(errors, "error", "INVALID_SETTINGS", "settings がオブジェクトではありません。");
  } else {
    addDiagnosticEntry(checks, "ok", "VALID_SETTINGS_OBJECT", "settings はオブジェクトです。");
  }

  if (!Array.isArray(items)) {
    addDiagnosticEntry(errors, "error", "INVALID_ITEMS", "items が配列ではありません。");
  } else {
    addDiagnosticEntry(checks, "ok", "VALID_ITEMS_ARRAY", "items は配列です。");
  }

  if (LEGACY_COUNCIL_MODES.includes(settings.defaultCouncilMode)) {
    addDiagnosticEntry(errors, "error", "LEGACY_DEFAULT_COUNCIL_MODE", `defaultCouncilMode に旧評議会モード名が残っています: ${settings.defaultCouncilMode}`);
  } else if (!COUNCIL_MODES.includes(settings.defaultCouncilMode)) {
    addDiagnosticEntry(errors, "error", "INVALID_DEFAULT_COUNCIL_MODE", `defaultCouncilMode が現在の8モードに含まれていません: ${settings.defaultCouncilMode || "未設定"}`);
  }

  const skippedStockTotal = reportItems
    .filter((item) => item.skipped && !item.purchased)
    .reduce((total, item) => total + toNumber(item.stockAddedAmount), 0);

  if (toNumber(settings.heartStock) !== skippedStockTotal) {
    addDiagnosticEntry(warnings, "warning", "HEART_STOCK_MISMATCH", `heartStock と見送り済み商品の加算額合計が一致しません。heartStock=${formatYen(settings.heartStock)} / 見送り済み合計=${formatYen(skippedStockTotal)}。手動編集や後日購入差し戻しがある場合は正常です。`);
  }

  reportItems.forEach((item, index) => {
    inspectDiagnosticItem(item, index, warnings, errors);
  });

  if (warnings.length === 0) {
    addDiagnosticEntry(checks, "ok", "NO_WARNINGS", "warning はありません。");
  }

  if (errors.length === 0) {
    addDiagnosticEntry(checks, "ok", "NO_ERRORS", "error はありません。");
  }

  return {
    appName: APP_NAME,
    reportType: "diagnostic",
    schemaVersion: DIAGNOSTIC_SCHEMA_VERSION,
    generatedAt: new Date().toISOString(),
    summary,
    checks,
    warnings,
    errors
  };
}

function createDiagnosticSummary(sourceItems) {
  const consideringItems = sourceItems.filter((item) => !item.purchased && !item.skipped);
  const purchasedItems = sourceItems.filter((item) => item.purchased);
  const skippedItems = sourceItems.filter((item) => item.skipped && !item.purchased);
  const v221ReviewedItems = sourceItems.filter((item) => item && item.reviewVersion === PRE_PURCHASE_REVIEW_VERSION);
  const legacyReviewedItems = sourceItems.filter((item) => item && item.judgment && item.reviewVersion !== PRE_PURCHASE_REVIEW_VERSION);
  const allHistories = sourceItems.flatMap((item) => Array.isArray(item.judgmentHistory) ? item.judgmentHistory : []);
  const v221Histories = allHistories.filter((entry) => entry && entry.type === "review" && entry.reviewVersion === PRE_PURCHASE_REVIEW_VERSION);
  const collectorBalanceSummary = calculateCollectorBalanceSummary(sourceItems);

  return {
    totalItems: sourceItems.length,
    consideringItems: consideringItems.length,
    purchasedItems: purchasedItems.length,
    skippedItems: skippedItems.length,
    consideringJudgmentCounts: countDiagnosticJudgments(consideringItems),
    allJudgmentCounts: countDiagnosticJudgments(sourceItems),
    heartStock: toNumber(settings.heartStock),
    monthlyBudget: toNumber(settings.monthlyBudget),
    defaultCouncilMode: settings.defaultCouncilMode,
    budgetStartDate: settings.budgetStartDate,
    budgetEndDate: settings.budgetEndDate,
    lastExportedAt: settings.lastExportedAt || "",
    lastImportedAt: settings.lastImportedAt || "",
    v221ReviewedItemCount: v221ReviewedItems.length,
    v221HistoryCount: v221Histories.length,
    legacyReviewedItemCount: legacyReviewedItems.length,
    v221ItemsWithLegacyStatusCount: sourceItems.filter(hasJudgmentLikeStatus).length,
    v221LegacyCommentHeadingCount: sourceItems.filter((item) => hasJudgmentHeadingLine(item.judgmentComment) || hasJudgmentHeadingLine(item.modeComment)).length,
    v221LegacyHistoryCommentHeadingCount: allHistories.filter((entry) => hasJudgmentHeadingLine(entry && entry.judgmentComment) || hasJudgmentHeadingLine(entry && entry.modeComment)).length,
    v221MalformedHistoryCount: v221Histories.filter(isMalformedV221HistoryEntry).length,
    itemBodyPriceStatusLeakCount: sourceItems.filter(hasItemBodyReviewSnapshotLeak).length,
    collectorLightTotal: collectorBalanceSummary.totalLight,
    collectorDarkTotal: collectorBalanceSummary.totalDark,
    collectorBalanceScore: collectorBalanceSummary.balanceScore,
    collectorBalanceTitle: collectorBalanceSummary.title,
    observedPurchaseHistoryCount: collectorBalanceSummary.observedPurchaseHistoryCount,
    v3PurchaseHistoryMalformedCount: allHistories.filter(isMalformedPostPurchaseV3HistoryEntry).length,
    skipHistoryCount: allHistories.filter((entry) => entry && entry.type === "skip").length,
    v3SkipHistoryMalformedCount: allHistories.filter(isMalformedSkipV33HistoryEntry).length
  };
}

function calculateCollectorBalanceSummary(sourceItems) {
  const totals = (Array.isArray(sourceItems) ? sourceItems : []).reduce((summary, item) => {
    if (!Array.isArray(item && item.judgmentHistory)) return summary;

    item.judgmentHistory.forEach((entry) => {
      if (!isCollectorBalanceHistoryEntry(entry)) return;

      summary.totalLight += entry.collectorLightDelta;
      summary.totalDark += entry.collectorDarkDelta;
      summary.observedPurchaseHistoryCount += 1;
    });

    return summary;
  }, {
    totalLight: 0,
    totalDark: 0,
    observedPurchaseHistoryCount: 0
  });

  const balanceScore = totals.totalLight - totals.totalDark;
  const title = getCollectorBalanceTitle(totals.totalLight, totals.totalDark);

  return {
    ...totals,
    balanceScore,
    title,
    description: getCollectorBalanceDescription(totals.totalLight, totals.totalDark)
  };
}

function isCollectorBalanceHistoryEntry(entry) {
  return Boolean(
    entry &&
    entry.type === "purchase" &&
    isStrictFiniteNumber(entry.collectorLightDelta) &&
    isStrictFiniteNumber(entry.collectorDarkDelta)
  );
}

function getCollectorBalanceTitle(totalLight, totalDark) {
  const light = Number.isFinite(totalLight) ? totalLight : 0;
  const dark = Number.isFinite(totalDark) ? totalDark : 0;
  const balanceScore = light - dark;

  if (light === 0 && dark === 0) return "未観測の収集者";
  if (balanceScore >= 30) return "光のコレクター";
  if (balanceScore >= 10) return "理性ある収集者";
  if (dark - light >= 30) return "深淵をのぞくコレクター";
  if (dark - light >= 10) return "暗き棚に触れし者";
  return "均衡を保つ収集者";
}

function getCollectorBalanceDescription(totalLight, totalDark) {
  const title = getCollectorBalanceTitle(totalLight, totalDark);
  const descriptions = {
    "未観測の収集者": "まだ購入後判決の記録がありません。最初の購入後評議会から、コレクター傾向の観測が始まります。",
    "光のコレクター": "基準価格以下・目標価格到達・セール購入など、理性的な戦果が多い状態です。",
    "理性ある収集者": "ライトサイドが優勢です。欲しい気持ちを保ちつつ、比較的落ち着いた判断ができています。",
    "均衡を保つ収集者": "ライトサイドとダークサイドが拮抗しています。理性と衝動の境界を歩いています。",
    "暗き棚に触れし者": "ダークサイドがやや優勢です。プレ値購入や警告突破が続いていないか振り返る価値があります。",
    "深淵をのぞくコレクター": "ダークサイドが大きく優勢です。欲しい気持ちに飲まれすぎていないか、次の購入前に一度立ち止まりましょう。"
  };

  return descriptions[title];
}

function countDiagnosticJudgments(sourceItems) {
  return sourceItems.reduce((counts, item) => {
    if (!item || !item.judgment) {
      counts.unreviewed += 1;
      return counts;
    }

    if (item.judgment === "買い") {
      counts.buy += 1;
    } else if (item.judgment === "保留") {
      counts.hold += 1;
    } else if (item.judgment === "見送り") {
      counts.skipJudgment += 1;
    } else if (item.judgment === "危険な買い") {
      counts.dangerousBuy += 1;
    }

    return counts;
  }, {
    unreviewed: 0,
    buy: 0,
    hold: 0,
    skipJudgment: 0,
    dangerousBuy: 0
  });
}

function inspectDiagnosticItem(item, index, warnings, errors) {
  const itemLabel = item && item.name ? `${item.name} (${item.id || `index:${index}`})` : `index:${index}`;

  if (!item || typeof item !== "object" || Array.isArray(item)) {
    addDiagnosticEntry(errors, "error", "INVALID_ITEM_OBJECT", `商品データがオブジェクトではありません: ${itemLabel}`, { itemIndex: index });
    return;
  }

  if (!item.id) {
    addDiagnosticEntry(errors, "error", "MISSING_ITEM_ID", `item.id がありません: ${itemLabel}`, { itemIndex: index });
  }

  if (item.purchased && item.skipped) {
    addDiagnosticEntry(errors, "error", "PURCHASED_AND_SKIPPED", `purchased と skipped が両方 true です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  inspectDiagnosticStatusConsistency(item, itemLabel, index, warnings, errors);
  inspectDiagnosticCouncilMode(item, itemLabel, index, warnings, errors);
  inspectDiagnosticSalesAndPriceBasis(item, itemLabel, index, errors);
  inspectDiagnosticJudgment(item, itemLabel, index, warnings, errors);
  inspectDiagnosticStatusValue(item, itemLabel, index, warnings);
  inspectDiagnosticItemBodySnapshots(item, itemLabel, index, warnings);
  inspectDiagnosticV221Item(item, itemLabel, index, warnings, errors);
  inspectDiagnosticReviewSideEffects(item, itemLabel, index, warnings);
  inspectDiagnosticSkippedItem(item, itemLabel, index, warnings, errors);
  inspectDiagnosticPurchasedItem(item, itemLabel, index, warnings, errors);
  inspectDiagnosticHistory(item, itemLabel, index, warnings, errors);
}

function inspectDiagnosticStatusConsistency(item, itemLabel, index, warnings, errors) {
  if (item.status === "見送り済み" && item.skipped !== true) {
    addDiagnosticEntry(errors, "error", "STATUS_SKIPPED_MISMATCH", `status は見送り済みですが skipped が true ではありません: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (item.status === "購入済み" && item.purchased !== true) {
    addDiagnosticEntry(errors, "error", "STATUS_PURCHASED_MISMATCH", `status は購入済みですが purchased が true ではありません: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (item.purchased === true && item.status && item.status !== "購入済み") {
    addDiagnosticEntry(warnings, "warning", "PURCHASED_STATUS_NOT_ALIGNED", `purchased は true ですが status が購入済みではありません: ${itemLabel}`, { itemId: item.id || "", itemIndex: index, status: item.status });
  }

  if (item.skipped === true && item.purchased !== true && item.status && item.status !== "見送り済み") {
    addDiagnosticEntry(warnings, "warning", "SKIPPED_STATUS_NOT_ALIGNED", `skipped は true ですが status が見送り済みではありません: ${itemLabel}`, { itemId: item.id || "", itemIndex: index, status: item.status });
  }
}

function inspectDiagnosticCouncilMode(item, itemLabel, index, warnings, errors) {
  if (LEGACY_COUNCIL_MODES.includes(item.councilMode)) {
    addDiagnosticEntry(errors, "error", "LEGACY_COUNCIL_MODE", `旧評議会モード名が残っています: ${item.councilMode} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
    return;
  }

  if (item.councilMode && !COUNCIL_MODES.includes(item.councilMode)) {
    addDiagnosticEntry(errors, "error", "INVALID_COUNCIL_MODE", `councilMode が現在の8モードに含まれていません: ${item.councilMode} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticSalesAndPriceBasis(item, itemLabel, index, errors) {
  if (!ITEM_TYPE_OPTIONS.includes(item.itemType)) {
    addDiagnosticEntry(errors, "error", "INVALID_ITEM_TYPE", `itemType が許可された販売状態ではありません: ${item.itemType || "未設定"} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (!PRICE_BASIS_TYPES.includes(item.priceBasisType)) {
    addDiagnosticEntry(errors, "error", "INVALID_PRICE_BASIS_TYPE", `priceBasisType が許可された価格基準ではありません: ${item.priceBasisType || "未設定"} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticJudgment(item, itemLabel, index, warnings, errors) {
  if (!item.judgment) {
    if (item.judgedAt || item.judgmentComment || hasReviewHistory(item)) {
      addDiagnosticEntry(warnings, "warning", "INCOMPLETE_REVIEW_JUDGMENT", `購入前審議の一部だけが残っていますが judgment が空です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
    }
    return;
  }

  if (!VALID_JUDGMENTS.includes(item.judgment)) {
    addDiagnosticEntry(errors, "error", "INVALID_JUDGMENT", `judgment が有効な判定名ではありません: ${item.judgment} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticStatusValue(item, itemLabel, index, warnings) {
  if (!item.status) return;

  if (hasJudgmentLikeStatus(item)) {
    addDiagnosticEntry(warnings, "warning", "LEGACY_JUDGMENT_STATUS_VALUE", `status に購入前審議結果由来の値が保存されています。表示上は行動状態として扱います: ${item.status} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
    return;
  }

  if (!VALID_ACTION_STATUSES.includes(item.status)) {
    addDiagnosticEntry(warnings, "warning", "INVALID_ACTION_STATUS_VALUE", `status が有効な行動状態ではありません: ${item.status} / ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticItemBodySnapshots(item, itemLabel, index, warnings) {
  if (!hasItemBodyReviewSnapshotLeak(item)) return;

  addDiagnosticEntry(warnings, "warning", "ITEM_BODY_REVIEW_SNAPSHOT_LEAK", `商品本体に履歴スナップショット用の項目が保存されています: ${itemLabel}`, {
    itemId: item.id || "",
    itemIndex: index,
    leakedFields: getItemBodyReviewSnapshotLeakFields(item)
  });
}

function inspectDiagnosticV221Item(item, itemLabel, index, warnings, errors) {
  if (item.reviewVersion !== PRE_PURCHASE_REVIEW_VERSION) return;

  inspectV221Judgments(item, itemLabel, index, "", warnings, errors);
  inspectRequiredString(item, "judgedAt", "V221_ITEM_MISSING_JUDGED_AT", itemLabel, index, warnings, errors);
  inspectRequiredString(item, "judgmentComment", "V221_ITEM_INVALID_JUDGMENT_COMMENT", itemLabel, index, warnings, errors);
  inspectRequiredString(item, "modeComment", "V221_ITEM_INVALID_MODE_COMMENT", itemLabel, index, warnings, errors);
  inspectV221Scores(item, itemLabel, index, "", errors);
  inspectV221Levels(item, itemLabel, index, "", errors);
  inspectRequiredEnum(item, "gateSource", VALID_GATE_SOURCES, "V221_ITEM_INVALID_GATE_SOURCE", itemLabel, index, "", errors);
  inspectRequiredBoolean(item, "hardRisk", "V221_ITEM_INVALID_HARD_RISK", itemLabel, index, "", errors);
  inspectRequiredBoolean(item, "modeAdjustmentApplied", "V221_ITEM_INVALID_MODE_ADJUSTMENT_APPLIED", itemLabel, index, "", errors);
  inspectRequiredString(item, "modeAdjustmentSummary", "V221_ITEM_INVALID_MODE_ADJUSTMENT_SUMMARY", itemLabel, index, warnings, errors, { allowEmpty: true });

  if (hasJudgmentHeadingLine(item.judgmentComment) || hasJudgmentHeadingLine(item.modeComment)) {
    addDiagnosticEntry(warnings, "warning", "V221_ITEM_COMMENT_HEADING_REMAINS", `v2.2.1商品本体のコメントに 判決：/判定： 見出し行が残っています: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticReviewSideEffects(item, itemLabel, index, warnings) {
  if (item.purchased === true || item.skipped === true || !item.judgment) return;

  if (toNumber(item.stockAddedAmount) > 0) {
    addDiagnosticEntry(warnings, "warning", "REVIEW_STOCK_ADDED_WITHOUT_SKIP", `購入も見送りも確定していない審議済み商品に stockAddedAmount が残っています: ${itemLabel}`, { itemId: item.id || "", itemIndex: index, stockAddedAmount: item.stockAddedAmount });
  }
}

function hasReviewHistory(item) {
  return Array.isArray(item.judgmentHistory) && item.judgmentHistory.some((entry) => entry && entry.type === "review");
}

function inspectDiagnosticSkippedItem(item, itemLabel, index, warnings, errors) {
  if (!item.skipped) return;

  if (!item.skippedAt) {
    addDiagnosticEntry(errors, "error", "SKIPPED_WITHOUT_SKIPPED_AT", `skipped が true ですが skippedAt が空です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (!Number.isFinite(Number(item.stockAddedAmount))) {
    addDiagnosticEntry(errors, "error", "INVALID_STOCK_ADDED_AMOUNT", `stockAddedAmount が数値ではありません: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  } else if (toNumber(item.stockAddedAmount) <= 0) {
    addDiagnosticEntry(warnings, "warning", "ZERO_STOCK_ADDED_AMOUNT", `見送り済み商品の stockAddedAmount が0以下です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticPurchasedItem(item, itemLabel, index, warnings, errors) {
  if (!item.purchased) return;

  if (!item.purchasedAt) {
    addDiagnosticEntry(errors, "error", "PURCHASED_WITHOUT_PURCHASED_AT", `purchased が true ですが purchasedAt が空です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (toNumber(item.purchasePrice) <= 0) {
    addDiagnosticEntry(errors, "error", "INVALID_PURCHASE_PRICE", `purchased が true ですが purchasePrice が0以下です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (!item.purchaseType) {
    addDiagnosticEntry(warnings, "warning", "MISSING_PURCHASE_TYPE", `購入済み商品の purchaseType が空です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }

  if (!item.purchaseJudgment) {
    addDiagnosticEntry(warnings, "warning", "MISSING_PURCHASE_JUDGMENT", `購入済み商品の purchaseJudgment が空です: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function inspectDiagnosticHistory(item, itemLabel, index, warnings, errors) {
  if (!Array.isArray(item.judgmentHistory)) {
    addDiagnosticEntry(errors, "error", "INVALID_JUDGMENT_HISTORY", `judgmentHistory が配列ではありません: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
    return;
  }

  if (item.judgmentHistory.length === 0) return;

  item.judgmentHistory.forEach((entry, historyIndex) => {
    inspectDiagnosticHistoryEntry(entry, item, itemLabel, index, historyIndex, warnings, errors);
  });

  inspectLatestReviewCommentConsistency(item, itemLabel, index, warnings);
}

function inspectDiagnosticHistoryEntry(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
    addDiagnosticEntry(errors, "error", "INVALID_HISTORY_ENTRY", `履歴がオブジェクトではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
    return;
  }

  if (!entry.type) {
    addDiagnosticEntry(errors, "error", "MISSING_HISTORY_TYPE", `履歴に type がありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
    return;
  }

  if (!VALID_HISTORY_TYPES.includes(entry.type)) {
    addDiagnosticEntry(errors, "error", "INVALID_HISTORY_TYPE", `履歴 type が review / purchase / skip ではありません: ${entry.type} / ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
    return;
  }

  if (LEGACY_COUNCIL_MODES.includes(entry.councilMode)) {
    addDiagnosticEntry(errors, "error", "LEGACY_HISTORY_COUNCIL_MODE", `履歴に旧評議会モード名が残っています: ${entry.councilMode} / ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  } else if (entry.councilMode && !COUNCIL_MODES.includes(entry.councilMode)) {
    addDiagnosticEntry(errors, "error", "INVALID_HISTORY_COUNCIL_MODE", `履歴の councilMode が現在の8モードに含まれていません: ${entry.councilMode} / ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (entry.type === "review") {
    inspectDiagnosticReviewHistory(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors);
  }

  if (entry.type === "purchase") {
    inspectDiagnosticPurchaseHistory(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors);
  }

  if (entry.type === "skip") {
    inspectDiagnosticSkipHistory(entry, item, itemLabel, itemIndex, historyIndex, warnings);
  }
}

function inspectDiagnosticReviewHistory(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors) {
  if (!entry.judgment || !entry.judgmentComment || !entry.councilMode) {
    addDiagnosticEntry(errors, "error", "INCOMPLETE_REVIEW_HISTORY", `review履歴に judgment / judgmentComment / councilMode の不足があります: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (entry.judgment && !VALID_JUDGMENTS.includes(entry.judgment)) {
    addDiagnosticEntry(errors, "error", "INVALID_HISTORY_JUDGMENT", `review履歴の judgment が有効な判定名ではありません: ${entry.judgment} / ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (entry.reviewVersion === PRE_PURCHASE_REVIEW_VERSION) {
    inspectDiagnosticV221History(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors);
  }
}

function inspectDiagnosticV221History(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors) {
  const historyContext = ` / history:${historyIndex}`;

  if (entry.type !== "review") {
    addDiagnosticEntry(errors, "error", "V221_HISTORY_INVALID_TYPE", `v2.2.1履歴の type が review ではありません: ${itemLabel}${historyContext}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  inspectRequiredString(entry, "judgedAt", "V221_HISTORY_MISSING_JUDGED_AT", itemLabel, itemIndex, warnings, errors, { historyIndex });
  inspectRequiredString(entry, "councilMode", "V221_HISTORY_MISSING_COUNCIL_MODE", itemLabel, itemIndex, warnings, errors, { historyIndex });
  inspectV221Judgments(entry, itemLabel, itemIndex, historyContext, warnings, errors, { historyIndex });
  inspectRequiredString(entry, "judgmentComment", "V221_HISTORY_INVALID_JUDGMENT_COMMENT", itemLabel, itemIndex, warnings, errors, { historyIndex });
  inspectRequiredString(entry, "modeComment", "V221_HISTORY_INVALID_MODE_COMMENT", itemLabel, itemIndex, warnings, errors, { historyIndex });
  inspectV221Scores(entry, itemLabel, itemIndex, historyContext, errors, { historyIndex });
  inspectV221Levels(entry, itemLabel, itemIndex, historyContext, errors, { historyIndex });
  inspectRequiredEnum(entry, "gateSource", VALID_GATE_SOURCES, "V221_HISTORY_INVALID_GATE_SOURCE", itemLabel, itemIndex, historyContext, errors, { historyIndex });
  inspectRequiredBoolean(entry, "hardRisk", "V221_HISTORY_INVALID_HARD_RISK", itemLabel, itemIndex, historyContext, errors, { historyIndex });
  inspectRequiredBoolean(entry, "modeAdjustmentApplied", "V221_HISTORY_INVALID_MODE_ADJUSTMENT_APPLIED", itemLabel, itemIndex, historyContext, errors, { historyIndex });
  inspectRequiredString(entry, "modeAdjustmentSummary", "V221_HISTORY_INVALID_MODE_ADJUSTMENT_SUMMARY", itemLabel, itemIndex, warnings, errors, { historyIndex, allowEmpty: true });
  inspectV221HistorySnapshotFields(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors);

  if (hasJudgmentHeadingLine(entry.judgmentComment) || hasJudgmentHeadingLine(entry.modeComment)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_COMMENT_HEADING_REMAINS", `v2.2.1履歴のコメントに 判決：/判定： 見出し行が残っています: ${itemLabel}${historyContext}`, { itemId: item.id || "", itemIndex, historyIndex });
  }
}

function inspectV221Judgments(target, itemLabel, itemIndex, contextText, warnings, errors, details = {}) {
  inspectRequiredEnum(target, "baseJudgment", VALID_JUDGMENTS, "V221_INVALID_BASE_JUDGMENT", itemLabel, itemIndex, contextText, errors, details);
  inspectRequiredEnum(target, "finalJudgment", VALID_JUDGMENTS, "V221_INVALID_FINAL_JUDGMENT", itemLabel, itemIndex, contextText, errors, details);
  inspectRequiredEnum(target, "judgment", VALID_JUDGMENTS, "V221_INVALID_JUDGMENT", itemLabel, itemIndex, contextText, errors, details);

  if (VALID_JUDGMENTS.includes(target.judgment) && VALID_JUDGMENTS.includes(target.finalJudgment) && target.judgment !== target.finalJudgment) {
    addDiagnosticEntry(errors, "error", "V221_JUDGMENT_FINAL_MISMATCH", `v2.2.1の judgment と finalJudgment が一致していません: ${itemLabel}${contextText}`, {
      itemId: details.itemId || "",
      itemIndex,
      historyIndex: details.historyIndex,
      judgment: target.judgment,
      finalJudgment: target.finalJudgment
    });
  }
}

function inspectV221Scores(target, itemLabel, itemIndex, contextText, errors, details = {}) {
  ["desireScore", "timingScore", "riskScore"].forEach((field) => {
    if (!isStrictFiniteNumber(target[field])) {
      addDiagnosticEntry(errors, "error", "V221_INVALID_SCORE", `v2.2.1の ${field} が数値ではありません: ${itemLabel}${contextText}`, { itemIndex, historyIndex: details.historyIndex, field });
      return;
    }

    if (target[field] < 0 || target[field] > 100) {
      addDiagnosticEntry(errors, "error", "V221_SCORE_OUT_OF_RANGE", `v2.2.1の ${field} が0〜100の範囲外です: ${itemLabel}${contextText}`, { itemIndex, historyIndex: details.historyIndex, field, value: target[field] });
    }
  });
}

function inspectV221Levels(target, itemLabel, itemIndex, contextText, errors, details = {}) {
  inspectRequiredEnum(target, "desireLevel", VALID_DESIRE_LEVELS, "V221_INVALID_DESIRE_LEVEL", itemLabel, itemIndex, contextText, errors, details);
  inspectRequiredEnum(target, "timingLevel", VALID_TIMING_LEVELS, "V221_INVALID_TIMING_LEVEL", itemLabel, itemIndex, contextText, errors, details);
  inspectRequiredEnum(target, "riskLevel", VALID_RISK_LEVELS, "V221_INVALID_RISK_LEVEL", itemLabel, itemIndex, contextText, errors, details);
}

function inspectV221HistorySnapshotFields(entry, item, itemLabel, itemIndex, historyIndex, warnings) {
  if (!VALID_REVIEW_PRICE_STATUS_KEYS.includes(entry.reviewPriceStatusKey)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_REVIEW_PRICE_STATUS_KEY", `v2.2.1履歴の reviewPriceStatusKey が未設定または有効値ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex, value: entry.reviewPriceStatusKey });
  }

  if (entry.reviewPriceDeviationRate !== null && !isStrictFiniteNumber(entry.reviewPriceDeviationRate)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_REVIEW_PRICE_DEVIATION_RATE", `v2.2.1履歴の reviewPriceDeviationRate が number または null ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (!Array.isArray(entry.reviewReasonLines)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_REASON_LINES", `v2.2.1履歴の reviewReasonLines が配列ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (!Array.isArray(entry.reviewReasonTags)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_REASON_TAGS", `v2.2.1履歴の reviewReasonTags が配列ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (!isStrictFiniteNumber(entry.acceleratorScore)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_ACCELERATOR_SCORE", `v2.2.1履歴の acceleratorScore が数値ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (!isStrictFiniteNumber(entry.brakeScore)) {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_BRAKE_SCORE", `v2.2.1履歴の brakeScore が数値ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (typeof entry.budgetImpact !== "string") {
    addDiagnosticEntry(warnings, "warning", "V221_HISTORY_INVALID_BUDGET_IMPACT", `v2.2.1履歴の budgetImpact が文字列ではありません: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }
}

function inspectRequiredEnum(target, field, validValues, code, itemLabel, itemIndex, contextText, errors, details = {}) {
  if (!validValues.includes(target[field])) {
    addDiagnosticEntry(errors, "error", code, `${field} が有効値ではありません: ${target[field] || "未設定"} / ${itemLabel}${contextText}`, { itemIndex, historyIndex: details.historyIndex, field, value: target[field] });
  }
}

function inspectRequiredBoolean(target, field, code, itemLabel, itemIndex, contextText, errors, details = {}) {
  if (typeof target[field] !== "boolean") {
    addDiagnosticEntry(errors, "error", code, `${field} が boolean ではありません: ${itemLabel}${contextText}`, { itemIndex, historyIndex: details.historyIndex, field, value: target[field] });
  }
}

function inspectRequiredString(target, field, code, itemLabel, itemIndex, warnings, errors, options = {}) {
  const value = target[field];
  if (typeof value !== "string" || (!options.allowEmpty && value.trim() === "")) {
    addDiagnosticEntry(errors, "error", code, `${field} が文字列ではない、または空です: ${itemLabel}${options.historyIndex !== undefined ? ` / history:${options.historyIndex}` : ""}`, { itemIndex, historyIndex: options.historyIndex, field, value });
  }
}

function isMalformedV221HistoryEntry(entry) {
  if (!entry || entry.type !== "review" || entry.reviewVersion !== PRE_PURCHASE_REVIEW_VERSION) return false;
  if (!VALID_JUDGMENTS.includes(entry.judgment) || !VALID_JUDGMENTS.includes(entry.baseJudgment) || !VALID_JUDGMENTS.includes(entry.finalJudgment)) return true;
  if (entry.judgment !== entry.finalJudgment) return true;
  if (!isStrictFiniteNumber(entry.desireScore) || !isStrictFiniteNumber(entry.timingScore) || !isStrictFiniteNumber(entry.riskScore)) return true;
  if (entry.desireScore < 0 || entry.desireScore > 100 || entry.timingScore < 0 || entry.timingScore > 100 || entry.riskScore < 0 || entry.riskScore > 100) return true;
  if (!VALID_DESIRE_LEVELS.includes(entry.desireLevel) || !VALID_TIMING_LEVELS.includes(entry.timingLevel) || !VALID_RISK_LEVELS.includes(entry.riskLevel)) return true;
  if (!VALID_GATE_SOURCES.includes(entry.gateSource)) return true;
  if (typeof entry.hardRisk !== "boolean" || typeof entry.modeAdjustmentApplied !== "boolean") return true;
  if (typeof entry.judgmentComment !== "string" || typeof entry.modeComment !== "string") return true;
  return false;
}

function hasJudgmentLikeStatus(item) {
  return VALID_JUDGMENTS.includes(item && item.status);
}

function hasJudgmentHeadingLine(text) {
  return /^\s*(判決|判定)\s*[:：].*$/m.test(String(text || ""));
}

function hasItemBodyReviewSnapshotLeak(item) {
  return getItemBodyReviewSnapshotLeakFields(item).length > 0;
}

function getItemBodyReviewSnapshotLeakFields(item) {
  return [
    "priceStatusKey",
    "reviewPriceStatusKey",
    "reviewPriceDeviationRate",
    "reviewReasonLines",
    "reviewReasonTags",
    "collectorLightDelta",
    "collectorDarkDelta",
    "collectorBalanceReasonLines",
    "collectorBalanceReasonTags",
    "collectorLightTotal",
    "collectorDarkTotal",
    "collectorBalanceScore",
    "postPurchaseReasonLines",
    "postPurchaseReasonTags"
  ]
    .filter((field) => Object.prototype.hasOwnProperty.call(item || {}, field));
}

function isStrictFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function inspectDiagnosticPurchaseHistory(entry, item, itemLabel, itemIndex, historyIndex, warnings, errors) {
  if (toNumber(entry.purchasePrice) <= 0 || !entry.purchaseType || !entry.judgment || !entry.judgmentComment) {
    addDiagnosticEntry(errors, "error", "INCOMPLETE_PURCHASE_HISTORY", `purchase履歴に purchasePrice / purchaseType / judgment / judgmentComment の不足があります: ${itemLabel} / history:${historyIndex}`, { itemId: item.id || "", itemIndex, historyIndex });
  }

  if (entry.postPurchaseVersion === POST_PURCHASE_VERSION) {
    inspectPostPurchaseV3History(entry, item, itemLabel, itemIndex, historyIndex, warnings);
  }
}

function inspectPostPurchaseV3History(entry, item, itemLabel, itemIndex, historyIndex, warnings) {
  const invalidFields = getMalformedPostPurchaseV3HistoryFields(entry);

  if (invalidFields.length === 0) return;

  addDiagnosticEntry(warnings, "warning", "POST_PURCHASE_V3_MALFORMED_HISTORY", `v3.0 purchase履歴の主要項目が不正です: ${itemLabel} / history:${historyIndex}`, {
    itemId: item.id || "",
    itemIndex,
    historyIndex,
    invalidFields
  });
}

function isMalformedPostPurchaseV3HistoryEntry(entry) {
  return Boolean(entry && entry.type === "purchase" && entry.postPurchaseVersion === POST_PURCHASE_VERSION && getMalformedPostPurchaseV3HistoryFields(entry).length > 0);
}

function getMalformedPostPurchaseV3HistoryFields(entry) {
  const invalidFields = [];

  if (!isStrictFiniteNumber(entry.collectorLightDelta)) invalidFields.push("collectorLightDelta");
  if (!isStrictFiniteNumber(entry.collectorDarkDelta)) invalidFields.push("collectorDarkDelta");
  if (!Array.isArray(entry.postPurchaseReasonLines)) invalidFields.push("postPurchaseReasonLines");
  if (!Array.isArray(entry.postPurchaseReasonTags)) invalidFields.push("postPurchaseReasonTags");
  if (!Array.isArray(entry.collectorBalanceReasonLines)) invalidFields.push("collectorBalanceReasonLines");
  if (!Array.isArray(entry.collectorBalanceReasonTags)) invalidFields.push("collectorBalanceReasonTags");

  return invalidFields;
}

function inspectDiagnosticSkipHistory(entry, item, itemLabel, itemIndex, historyIndex, warnings) {
  if (entry.skipVersion !== SKIP_HISTORY_VERSION) return;

  const invalidFields = getMalformedSkipV33HistoryFields(entry);
  if (invalidFields.length === 0) return;

  addDiagnosticEntry(warnings, "warning", "SKIP_V33_MALFORMED_HISTORY", `v3.3 skip履歴の主要項目が不正です: ${itemLabel} / history:${historyIndex}`, {
    itemId: item.id || "",
    itemIndex,
    historyIndex,
    invalidFields
  });
}

function isMalformedSkipV33HistoryEntry(entry) {
  return Boolean(entry && entry.type === "skip" && entry.skipVersion === SKIP_HISTORY_VERSION && getMalformedSkipV33HistoryFields(entry).length > 0);
}

function getMalformedSkipV33HistoryFields(entry) {
  const invalidFields = [];

  if (entry.type !== "skip") invalidFields.push("type");
  if (entry.skipVersion !== SKIP_HISTORY_VERSION) invalidFields.push("skipVersion");
  if (typeof entry.skippedAt !== "string" || !entry.skippedAt) invalidFields.push("skippedAt");
  if (!VALID_JUDGMENTS.includes(entry.judgment)) invalidFields.push("judgment");
  if (!isStrictFiniteNumber(entry.currentPrice)) invalidFields.push("currentPrice");
  if (!isStrictFiniteNumber(entry.addedHeartStock)) invalidFields.push("addedHeartStock");
  if (entry.reason !== "user_confirmed_skip") invalidFields.push("reason");

  return invalidFields;
}

function inspectLatestReviewCommentConsistency(item, itemLabel, index, warnings) {
  if (!item.judgmentComment) return;

  const latestReview = item.judgmentHistory
    .slice()
    .reverse()
    .find((entry) => entry.type === "review");

  if (!latestReview || !latestReview.judgmentComment) return;

  if (item.judgmentComment !== latestReview.judgmentComment) {
    addDiagnosticEntry(warnings, "warning", "LATEST_REVIEW_COMMENT_MISMATCH", `item.judgmentComment と最新review履歴の judgmentComment が異なります: ${itemLabel}`, { itemId: item.id || "", itemIndex: index });
  }
}

function addDiagnosticEntry(collection, level, code, message, details = {}) {
  collection.push({
    level,
    code,
    message,
    ...details
  });
}

function exportDiagnosticReport() {
  const generatedAt = new Date();
  const report = createDiagnosticReport();
  const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `collector-council-diagnostic-report-${formatBackupFileTimestamp(generatedAt)}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
  alert("データ診断レポートを書き出しました。");
}

function resetTestData() {
  const confirmed = confirm("現在の商品データ・設定データを初期化します。\nこの操作は元に戻せません。\n必要な場合は先に「データを書き出す」でバックアップしてください。\n\n本当に初期化しますか？");
  if (!confirmed) return;

  clearPendingDraftMarketResearch();
  localStorage.removeItem(SETTINGS_STORAGE_KEY);
  localStorage.removeItem(ITEMS_STORAGE_KEY);
  location.reload();
}

// ==============================
// 集計
// ==============================

function getDefaultBudgetPeriod() {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  return {
    start: formatDateInputValue(start),
    end: formatDateInputValue(end)
  };
}

function getMonthlySpent() {
  const startDate = parseDateOnly(settings.budgetStartDate);
  const endDate = parseDateOnly(settings.budgetEndDate);

  return items.reduce((total, item) => {
    if (!item.purchased || !item.purchasedAt) {
      return total;
    }

    const purchasedAt = parseDateOnly(item.purchasedAt);
    if (!purchasedAt || !startDate || !endDate) {
      return total;
    }

    if (purchasedAt < startDate || purchasedAt > endDate) {
      return total;
    }

    return total + toNumber(item.purchasePrice);
  }, 0);
}

function getRemainingBudget() {
  return toNumber(settings.monthlyBudget) - getMonthlySpent();
}

function getJudgmentCounts() {
  return items.reduce(
    (counts, item) => {
      if (item.judgment === "買い") counts.buy += 1;
      if (item.judgment === "保留") counts.hold += 1;
      if (item.judgment === "見送り") counts.skip += 1;
      if (item.judgment === "危険な買い") counts.danger += 1;
      return counts;
    },
    { buy: 0, hold: 0, skip: 0, danger: 0 }
  );
}

function getItemStatusCounts() {
  return items.reduce(
    (counts, item) => {
      if (item.purchased) {
        counts.purchased += 1;
      } else if (item.skipped) {
        counts.skipped += 1;
      } else {
        counts.considering += 1;
      }

      return counts;
    },
    { considering: 0, purchased: 0, skipped: 0 }
  );
}

function getConsideringItems() {
  return items.filter((item) => item.purchased !== true && item.skipped !== true);
}

function getConsideringJudgmentCounts() {
  return getConsideringItems().reduce(
    (counts, item) => {
      counts.all += 1;

      if (!item.judgment) {
        counts.unreviewed += 1;
      } else if (item.judgment === "買い") {
        counts.buy += 1;
      } else if (item.judgment === "保留") {
        counts.hold += 1;
      } else if (item.judgment === "見送り") {
        counts.skipJudgment += 1;
      } else if (item.judgment === "危険な買い") {
        counts.danger += 1;
      }

      return counts;
    },
    { all: 0, unreviewed: 0, buy: 0, hold: 0, skipJudgment: 0, danger: 0 }
  );
}

function getItemsForTab(tabName) {
  if (tabName === "purchased") {
    return items.filter((item) => item.purchased === true);
  }

  if (tabName === "skipped") {
    return items.filter((item) => item.skipped === true && item.purchased !== true);
  }

  if (tabName === "considering") {
    return filterConsideringItems(getConsideringItems());
  }

  return [];
}

function filterConsideringItems(sourceItems) {
  if (consideringFilter === "unreviewed") {
    return sourceItems.filter((item) => !item.judgment);
  }

  if (consideringFilter === "buy") {
    return sourceItems.filter((item) => item.judgment === "買い");
  }

  if (consideringFilter === "hold") {
    return sourceItems.filter((item) => item.judgment === "保留");
  }

  if (consideringFilter === "skipJudgment") {
    return sourceItems.filter((item) => item.judgment === "見送り");
  }

  if (consideringFilter === "danger") {
    return sourceItems.filter((item) => item.judgment === "危険な買い");
  }

  return sourceItems;
}

// ==============================
// 判定ロジック
// ==============================

function judgeItem(item, councilMode) {
  const metrics = calculatePrePurchaseReviewMetrics(item);
  const gateSource = determineReviewGateSource(item, metrics);
  const baseJudgment = determineBaseJudgment(metrics, gateSource);
  const adjustment = applyModeAdjustment(baseJudgment, councilMode, metrics, gateSource);
  const finalJudgment = adjustment.finalJudgment;
  const modeComment = stripJudgmentHeadingLines(getPrePurchaseComment(councilMode, finalJudgment));
  const budgetImpact = getReviewBudgetImpactText(metrics);
  const reviewReasonLines = buildReviewReasonLines(metrics, gateSource, adjustment);
  const reviewReasonTags = buildReviewReasonTags(metrics, gateSource, adjustment);
  const judgmentComment = buildPrePurchaseJudgmentComment({
    councilMode,
    judgment: finalJudgment,
    modeComment,
    metrics,
    gateSource,
    reviewReasonLines
  });

  return {
    reviewVersion: PRE_PURCHASE_REVIEW_VERSION,
    judgment: finalJudgment,
    baseJudgment,
    finalJudgment,
    judgmentComment,
    modeComment,
    councilMode,
    acceleratorScore: metrics.desireScore,
    brakeScore: metrics.riskScore,
    desireScore: metrics.desireScore,
    timingScore: metrics.timingScore,
    riskScore: metrics.riskScore,
    desireLevel: metrics.desireLevel,
    timingLevel: metrics.timingLevel,
    riskLevel: metrics.riskLevel,
    gateSource,
    hardRisk: metrics.hardRisk,
    modeAdjustmentApplied: adjustment.modeAdjustmentApplied,
    modeAdjustmentSummary: adjustment.modeAdjustmentSummary,
    reviewPriceStatusKey: metrics.priceStatusKey,
    reviewPriceDeviationRate: metrics.priceDeviationRate,
    reviewReasonLines,
    reviewReasonTags,
    budgetImpact
  };
}

function calculatePrePurchaseReviewMetrics(item) {
  const remainingBudget = getRemainingBudget();
  const monthlyBudget = toNumber(settings.monthlyBudget);
  const currentPrice = toNumber(item.currentPrice);
  const targetPrice = toNumber(item.targetPrice);
  const maxAcceptablePrice = toNumber(item.maxAcceptablePrice);
  const priceStatus = calculatePriceStatus(item);
  const priceStatusKey = priceStatus.key;
  const listPrice = toNumber(item.listPrice);
  const priceComparable = priceStatusKey !== "notComparable" && listPrice > 0 && currentPrice > 0;
  const priceDeviationRate = priceComparable ? (currentPrice - listPrice) / listPrice : null;
  const targetGapRate = targetPrice > 0 && currentPrice > 0 ? (currentPrice - targetPrice) / targetPrice : null;

  const scores = {
    wantScore: clampScore(item.wantScore),
    regretScore: clampScore(item.regretScore),
    rarityRiskScore: clampScore(item.rarityRiskScore),
    longEnjoymentScore: clampScore(item.longEnjoymentScore),
    spaceRiskScore: clampScore(item.spaceRiskScore),
    overbuyScore: clampScore(item.overbuyScore),
    explanationDifficultyScore: clampScore(item.explanationDifficultyScore),
    backlogRiskScore: clampScore(item.backlogRiskScore)
  };

  const salesStatus = getSelectableItemType(item.itemType);
  const desireScore = Math.round(scores.wantScore * 6 + scores.longEnjoymentScore * 4);
  const salesStatusBonus = getSalesStatusBonus(salesStatus);
  const priceChanceBonus = getPriceChanceBonus(priceStatusKey);
  const targetPriceBonus = targetPrice > 0 && currentPrice > 0 && currentPrice <= targetPrice ? 12 : 0;
  const timingScore = Math.min(100, Math.round(
    scores.regretScore * 3 +
    scores.rarityRiskScore * 3 +
    salesStatusBonus +
    priceChanceBonus +
    targetPriceBonus
  ));

  const budgetPressureRisk = getBudgetPressureRisk(monthlyBudget, remainingBudget, currentPrice);
  const overbuyRisk = scores.overbuyScore * 1.5;
  const budgetRiskScore = Math.min(35, budgetPressureRisk + overbuyRisk);
  const maxAcceptablePriceRisk = getMaxAcceptablePriceRisk(currentPrice, maxAcceptablePrice);
  const priceDeviationRisk = getPriceDeviationRisk(priceDeviationRate);
  const priceRiskScore = Math.max(maxAcceptablePriceRisk, priceDeviationRisk);
  const lifeRiskScore = Math.min(25, ((scores.spaceRiskScore + scores.explanationDifficultyScore) / 2) * 2.5);
  const backlogRiskScoreCapped = Math.min(10, scores.backlogRiskScore);
  const riskScore = clamp(Math.round(
    budgetRiskScore +
    priceRiskScore +
    lifeRiskScore +
    backlogRiskScoreCapped
  ), 0, 100);

  const hardRisk = currentPrice <= 0 ||
    (maxAcceptablePrice > 0 && currentPrice > maxAcceptablePrice) ||
    (monthlyBudget > 0 && currentPrice > remainingBudget) ||
    priceStatusKey === "clearPremium" ||
    (priceDeviationRate !== null && priceDeviationRate > 0.2) ||
    scores.spaceRiskScore >= 9 ||
    scores.backlogRiskScore >= 9 ||
    scores.explanationDifficultyScore >= 9;

  return {
    ...scores,
    currentPrice,
    targetPrice,
    maxAcceptablePrice,
    salesStatus,
    monthlyBudget,
    remainingBudget,
    priceStatusKey,
    priceDeviationRate,
    targetGapRate,
    desireScore,
    timingScore,
    riskScore,
    desireLevel: getDesireLevel(desireScore),
    timingLevel: getTimingLevel(timingScore),
    riskLevel: getRiskLevel(riskScore),
    salesStatusBonus,
    priceChanceBonus,
    targetPriceBonus,
    budgetRiskScore: Math.round(budgetRiskScore),
    priceRiskScore: Math.round(priceRiskScore),
    lifeRiskScore: Math.round(lifeRiskScore),
    backlogRiskScoreCapped: Math.round(backlogRiskScoreCapped),
    hardRisk
  };
}

function determineReviewGateSource(item, metrics) {
  const hasAlternativePriceBasis =
    (metrics.targetPrice > 0 && metrics.currentPrice <= metrics.targetPrice) ||
    (metrics.maxAcceptablePrice > 0 && metrics.currentPrice <= metrics.maxAcceptablePrice);

  if (metrics.currentPrice <= 0) return "invalid_price";
  if (metrics.desireScore <= 44) return "low_desire";
  if (metrics.maxAcceptablePrice > 0 && metrics.currentPrice > metrics.maxAcceptablePrice) return "max_price_over";
  if (metrics.monthlyBudget > 0 && metrics.currentPrice > metrics.remainingBudget) return "budget_over";
  if (metrics.priceStatusKey === "notComparable" && !hasAlternativePriceBasis) return "price_unknown";
  if (
    metrics.targetPrice > 0 &&
    metrics.currentPrice > metrics.targetPrice &&
    metrics.targetGapRate >= 0.05 &&
    ["通常販売中", "予約・発売前", "不明"].includes(metrics.salesStatus)
  ) {
    return "target_wait";
  }

  return "none";
}

function determineBaseJudgment(metrics, gateSource) {
  const desireHigh = metrics.desireScore >= 75;
  const desireMediumOrHigher = metrics.desireScore >= 55;
  const timingStrong = metrics.timingScore >= 65;
  const hardGate = isHardGateSource(gateSource);

  if (gateSource === "low_desire") {
    if (metrics.salesStatus === "廃盤・終売" && metrics.priceStatusKey === "baseOrBelow" && metrics.rarityRiskScore >= 8) {
      return "保留";
    }
    return "見送り";
  }

  if (gateSource === "invalid_price") {
    return desireMediumOrHigher ? "保留" : "見送り";
  }

  if (gateSource === "max_price_over" || gateSource === "budget_over") {
    if (desireHigh && timingStrong) return "危険な買い";
    return desireMediumOrHigher ? "保留" : "見送り";
  }

  if (gateSource === "price_unknown") {
    if (desireHigh && timingStrong && metrics.hardRisk) return "危険な買い";
    return desireMediumOrHigher ? "保留" : "見送り";
  }

  if (gateSource === "target_wait") {
    return "保留";
  }

  if (
    metrics.desireScore >= 75 &&
    metrics.timingScore >= 65 &&
    metrics.riskScore <= 50 &&
    metrics.hardRisk === false &&
    !hardGate
  ) {
    return "買い";
  }

  if (
    metrics.desireScore >= 60 &&
    metrics.timingScore >= 80 &&
    metrics.riskScore <= 35 &&
    metrics.hardRisk === false &&
    !hardGate
  ) {
    return "買い";
  }

  if (
    (metrics.desireScore >= 75 && metrics.timingScore >= 65 && metrics.riskScore >= 60) ||
    (metrics.desireScore >= 75 && metrics.riskScore >= 60 && metrics.hardRisk === true)
  ) {
    return "危険な買い";
  }

  if (
    (metrics.desireScore >= 55 && metrics.timingScore < 65) ||
    (metrics.desireScore >= 75 && metrics.timingScore >= 65 && metrics.riskScore >= 51 && metrics.riskScore <= 59 && metrics.hardRisk === false) ||
    (metrics.hardRisk === true && metrics.desireScore >= 55)
  ) {
    return "保留";
  }

  if (
    metrics.desireScore <= 44 ||
    (metrics.desireScore < 55 && metrics.timingScore < 65) ||
    (metrics.desireScore < 55 && metrics.riskScore >= 60)
  ) {
    return "見送り";
  }

  return "保留";
}

function applyModeAdjustment(baseJudgment, councilMode, metrics, gateSource) {
  // モード補正では素点を変えず、ハードゲートを突破せず、判定移動は1段階までにします。
  if (councilMode === "肯定モード" && canSweetModePromoteToBuy(baseJudgment, metrics, gateSource)) {
    return {
      finalJudgment: "買い",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildSweetModeAdjustmentSummary()
    };
  }

  if (councilMode === "財務省モード" && shouldFinanceModeHoldBuy(baseJudgment, metrics)) {
    return {
      finalJudgment: "保留",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildFinanceModeAdjustmentSummary(metrics)
    };
  }

  if (councilMode === "オタク友達モード" && canOtakuFriendModePromoteToBuy(baseJudgment, metrics, gateSource)) {
    return {
      finalJudgment: "買い",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildOtakuFriendModeAdjustmentSummary()
    };
  }

  if (councilMode === "未来の自分モード" && shouldFutureSelfModeHoldBuy(baseJudgment, metrics)) {
    return {
      finalJudgment: "保留",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildFutureSelfModeAdjustmentSummary(metrics)
    };
  }

  if (councilMode === "秘密結社モード" && canSecretSocietyModePromoteToBuy(baseJudgment, metrics, gateSource)) {
    return {
      finalJudgment: "買い",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildSecretSocietyModeAdjustmentSummary()
    };
  }

  if (councilMode === "銀河系騎士団モード" && canKnightOrderModePromoteToBuy(baseJudgment, metrics, gateSource)) {
    return {
      finalJudgment: "買い",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildKnightOrderModeAdjustmentSummary()
    };
  }

  if (councilMode === "社内稟議モード" && shouldCorporateApprovalModeHoldBuy(baseJudgment, metrics)) {
    return {
      finalJudgment: "保留",
      modeAdjustmentApplied: true,
      modeAdjustmentSummary: buildCorporateApprovalModeAdjustmentSummary(metrics)
    };
  }

  return {
    finalJudgment: baseJudgment,
    modeAdjustmentApplied: false,
    modeAdjustmentSummary: ""
  };
}

function canSweetModePromoteToBuy(baseJudgment, metrics, gateSource) {
  return canPromoteHoldToBuy(baseJudgment, metrics, gateSource) &&
    metrics.desireScore >= 72 &&
    metrics.timingScore >= 60 &&
    metrics.riskScore <= 45;
}

function shouldFinanceModeHoldBuy(baseJudgment, metrics) {
  if (baseJudgment !== "買い") return false;

  return metrics.riskScore >= 36 ||
    metrics.overbuyScore >= 7 ||
    metrics.priceStatusKey === "slightPremium" ||
    hasFinanceTargetPriceConcern(metrics);
}

function hasFinanceTargetPriceConcern(metrics) {
  return metrics.targetPrice > 0 &&
    metrics.currentPrice > metrics.targetPrice &&
    metrics.targetGapRate !== null &&
    metrics.targetGapRate >= 0.05;
}

function canOtakuFriendModePromoteToBuy(baseJudgment, metrics, gateSource) {
  return canPromoteHoldToBuy(baseJudgment, metrics, gateSource) &&
    metrics.desireScore >= 70 &&
    metrics.timingScore >= 62 &&
    metrics.riskScore <= 48 &&
    metrics.longEnjoymentScore >= 7 &&
    metrics.backlogRiskScore <= 6;
}

function shouldFutureSelfModeHoldBuy(baseJudgment, metrics) {
  if (baseJudgment !== "買い") return false;

  return metrics.longEnjoymentScore <= 6 ||
    metrics.backlogRiskScore >= 7 ||
    metrics.spaceRiskScore >= 7 ||
    metrics.overbuyScore >= 7;
}

function canSecretSocietyModePromoteToBuy(baseJudgment, metrics, gateSource) {
  return canPromoteHoldToBuy(baseJudgment, metrics, gateSource) &&
    metrics.desireScore >= 73 &&
    metrics.timingScore >= 63 &&
    metrics.riskScore <= 45 &&
    metrics.rarityRiskScore >= 8 &&
    ["品薄・売り切れ気味", "廃盤・終売"].includes(metrics.salesStatus);
}

function canKnightOrderModePromoteToBuy(baseJudgment, metrics, gateSource) {
  return canPromoteHoldToBuy(baseJudgment, metrics, gateSource) &&
    metrics.desireScore >= 72 &&
    metrics.timingScore >= 60 &&
    metrics.riskScore <= 45 &&
    metrics.longEnjoymentScore >= 8 &&
    metrics.explanationDifficultyScore <= 6;
}

function shouldCorporateApprovalModeHoldBuy(baseJudgment, metrics) {
  if (baseJudgment !== "買い") return false;

  return metrics.explanationDifficultyScore >= 6 ||
    metrics.overbuyScore >= 6 ||
    metrics.spaceRiskScore >= 6 ||
    metrics.riskScore >= 36 ||
    hasFinanceTargetPriceConcern(metrics);
}

function canPromoteHoldToBuy(baseJudgment, metrics, gateSource) {
  return baseJudgment === "保留" &&
    metrics.hardRisk === false &&
    gateSource === "none" &&
    metrics.priceStatusKey !== "clearPremium" &&
    (metrics.priceDeviationRate === null || metrics.priceDeviationRate <= 0.2) &&
    metrics.spaceRiskScore < 9 &&
    metrics.backlogRiskScore < 9 &&
    metrics.explanationDifficultyScore < 9;
}

function buildSweetModeAdjustmentSummary() {
  return "肯定モード補正：欲しい強さと買い時が十分にあり、危険度も許容範囲のため、保留から買いに補正しました。";
}

function buildFinanceModeAdjustmentSummary(metrics) {
  if (hasFinanceTargetPriceConcern(metrics)) {
    return "財務省モード補正：目標価格を5%以上上回っているため、買いから保留に補正しました。";
  }

  if (metrics.priceStatusKey === "slightPremium") {
    return "財務省モード補正：軽いプレ値が出ているため、支出判断を慎重に見て買いから保留に補正しました。";
  }

  if (metrics.overbuyScore >= 7) {
    return "財務省モード補正：買いすぎ傾向が強いため、今すぐ買わずに一度保留に補正しました。";
  }

  return "財務省モード補正：危険度が注意域に入っているため、支出判断を慎重に見て買いから保留に補正しました。";
}

function buildOtakuFriendModeAdjustmentSummary() {
  return "オタク友達モード補正：趣味として長く楽しめそうなので、友達目線で保留から買いに少し背中を押しました。";
}

function buildFutureSelfModeAdjustmentSummary(metrics) {
  if (metrics.longEnjoymentScore <= 6) {
    return "未来の自分モード補正：長く楽しめる見込みに少し不安があるため、買いから保留に補正しました。";
  }

  if (metrics.backlogRiskScore >= 7) {
    return "未来の自分モード補正：積み化する可能性が高いため、未来の満足度を考えて買いから保留に補正しました。";
  }

  if (metrics.spaceRiskScore >= 7) {
    return "未来の自分モード補正：置き場所や保管負担が大きくなりそうなため、買いから保留に補正しました。";
  }

  return "未来の自分モード補正：買いすぎによる後悔を避けるため、買いから保留に補正しました。";
}

function buildSecretSocietyModeAdjustmentSummary() {
  return "秘密結社モード補正：希少性と入手機会を重く見て、保留から買いに補正しました。";
}

function buildKnightOrderModeAdjustmentSummary() {
  return "銀河系騎士団モード補正：長く楽しめる一品として迎える意義があるため、保留から買いに補正しました。";
}

function buildCorporateApprovalModeAdjustmentSummary(metrics) {
  if (metrics.explanationDifficultyScore >= 6) {
    return "社内稟議モード補正：購入理由を説明しにくい要素があるため、買いから保留に補正しました。";
  }

  if (hasFinanceTargetPriceConcern(metrics)) {
    return "社内稟議モード補正：目標価格を5%以上上回っており、稟議上の説明材料が弱いため、買いから保留に補正しました。";
  }

  if (metrics.spaceRiskScore >= 6) {
    return "社内稟議モード補正：置き場所や保管負担の説明が必要になりそうなため、買いから保留に補正しました。";
  }

  if (metrics.overbuyScore >= 6) {
    return "社内稟議モード補正：買いすぎ傾向を説明しにくいため、買いから保留に補正しました。";
  }

  return "社内稟議モード補正：総合的なリスク説明が必要なため、買いから保留に補正しました。";
}

function getReviewBudgetImpactText(metrics) {
  if (metrics.monthlyBudget <= 0) {
    return "予算未設定のため、予算影響は未確認です。";
  }

  return getBudgetImpactText(metrics.currentPrice, metrics.remainingBudget);
}

function isHardGateSource(gateSource) {
  return ["invalid_price", "low_desire", "max_price_over", "budget_over", "price_unknown"].includes(gateSource);
}

function createJudgmentHistoryEntry(result) {
  return {
    type: "review",
    reviewVersion: result.reviewVersion || "",
    judgedAt: new Date().toISOString(),
    councilMode: result.councilMode,
    baseJudgment: result.baseJudgment || result.judgment,
    finalJudgment: result.finalJudgment || result.judgment,
    judgment: result.judgment,
    judgmentComment: result.judgmentComment,
    modeComment: result.modeComment || "",
    desireScore: result.desireScore || 0,
    timingScore: result.timingScore || 0,
    riskScore: result.riskScore || 0,
    desireLevel: result.desireLevel || "",
    timingLevel: result.timingLevel || "",
    riskLevel: result.riskLevel || "",
    gateSource: result.gateSource || "none",
    hardRisk: Boolean(result.hardRisk),
    modeAdjustmentApplied: Boolean(result.modeAdjustmentApplied),
    modeAdjustmentSummary: result.modeAdjustmentSummary || "",
    reviewPriceStatusKey: result.reviewPriceStatusKey || "notComparable",
    reviewPriceDeviationRate: result.reviewPriceDeviationRate,
    reviewReasonLines: Array.isArray(result.reviewReasonLines) ? result.reviewReasonLines : [],
    reviewReasonTags: Array.isArray(result.reviewReasonTags) ? result.reviewReasonTags : [],
    acceleratorScore: result.acceleratorScore,
    brakeScore: result.brakeScore,
    budgetImpact: result.budgetImpact
  };
}

function getSalesStatusBonus(itemType) {
  const bonuses = {
    "予約・発売前": 5,
    "通常販売中": 0,
    "品薄・売り切れ気味": 18,
    "廃盤・終売": 25,
    "不明": 0
  };

  return bonuses[getSelectableItemType(itemType)] || 0;
}

function getPriceChanceBonus(priceStatusKey) {
  const bonuses = {
    baseOrBelow: 15,
    nearBase: 8,
    slightPremium: 0,
    clearPremium: 0,
    notComparable: 0
  };

  return bonuses[priceStatusKey] || 0;
}

function getBudgetPressureRisk(monthlyBudget, remainingBudget, currentPrice) {
  if (monthlyBudget <= 0) {
    return 8;
  }

  if (currentPrice <= 0) {
    return 8;
  }

  if (remainingBudget <= 0 || currentPrice > remainingBudget) {
    return 35;
  }

  if (currentPrice >= remainingBudget * 0.8) {
    return 24;
  }

  if (currentPrice >= remainingBudget * 0.5) {
    return 12;
  }

  return 4;
}

function getMaxAcceptablePriceRisk(currentPrice, maxAcceptablePrice) {
  if (currentPrice <= 0 || maxAcceptablePrice <= 0 || currentPrice <= maxAcceptablePrice) {
    return 0;
  }

  const maxOverRate = (currentPrice - maxAcceptablePrice) / maxAcceptablePrice;
  if (maxOverRate < 0.05) return 22;
  if (maxOverRate < 0.1) return 25;
  return 30;
}

function getPriceDeviationRisk(priceDeviationRate) {
  if (priceDeviationRate === null || priceDeviationRate <= 0) return 0;
  if (priceDeviationRate <= 0.05) return 3;
  if (priceDeviationRate <= 0.2) return 10;
  if (priceDeviationRate <= 0.3) return 20;
  return 30;
}

function getDesireLevel(desireScore) {
  if (desireScore >= 75) return "高";
  if (desireScore >= 55) return "中";
  if (desireScore >= 45) return "低";
  return "かなり低い";
}

function getTimingLevel(timingScore) {
  if (timingScore >= 65) return "強い";
  if (timingScore >= 45) return "普通";
  return "弱い";
}

function getRiskLevel(riskScore) {
  if (riskScore >= 60) return "高";
  if (riskScore >= 36) return "注意";
  return "低";
}

function buildPrePurchaseJudgmentComment(details) {
  const reasons = details.reviewReasonLines.length > 0
    ? details.reviewReasonLines.map((line) => `・${line}`).join("\n")
    : "・大きな判断材料はありません。";
  const modeComment = stripJudgmentHeadingLines(details.modeComment);
  const riskLevelText = getDisplayRiskLevelText(details.metrics);
  const hardRiskSupplement = getHardRiskSupplementText(details.metrics, details.gateSource);
  const hardRiskSection = hardRiskSupplement
    ? `\n\n安全ゲート：\n・${hardRiskSupplement}`
    : "";

  return `【${details.councilMode}のコメント】\n${modeComment}\n\n欲しい強さ：${details.metrics.desireLevel}\n買い時：${details.metrics.timingLevel}\n危険度：${riskLevelText}${hardRiskSection}\n\n主な理由：\n${reasons}`;
}

function stripJudgmentHeadingLines(text) {
  return String(text || "")
    .split(/\r?\n/)
    .filter((line) => !/^\s*(判決|判定)\s*[:：].*$/.test(line))
    .join("\n")
    .trim();
}

function getDisplayRiskLevelText(metrics) {
  if (shouldShowInlineHardRiskNotice(metrics)) {
    return `${metrics.riskLevel}（安全ゲート該当）`;
  }

  return metrics.riskLevel;
}

function shouldShowInlineHardRiskNotice(metrics) {
  return Boolean(metrics.hardRisk) && (metrics.riskLevel === "低" || metrics.riskScore <= 35);
}

function getHardRiskSupplementText(metrics, gateSource) {
  if (!metrics.hardRisk) return "";

  if (gateSource === "invalid_price") {
    return "現在価格が未入力のため、安全ゲートに該当しています。";
  }

  if (gateSource === "max_price_over") {
    return "許容上限価格を超えているため、安全ゲートに該当しています。";
  }

  if (gateSource === "budget_over") {
    return "残り予算を超えているため、安全ゲートに該当しています。";
  }

  if (shouldShowInlineHardRiskNotice(metrics)) {
    return "危険度の点数は低めですが、安全ゲートに該当する条件があります。";
  }

  return "危険度の点数とは別に、安全ゲートに該当する条件があります。";
}

function buildReviewReasonLines(metrics, gateSource, adjustment) {
  const reasons = [];

  if (metrics.desireLevel === "高") {
    reasons.push("欲しい強さは高く、長く楽しめる見込みもあります。");
  } else if (metrics.desireLevel === "中") {
    reasons.push("欲しい気持ちはありますが、決定打はもう少し確認したい状態です。");
  } else {
    reasons.push("欲しい強さがまだ弱く、勢いだけで進めるには根拠が足りません。");
  }

  if (metrics.timingLevel === "強い") {
    reasons.push("販売状態や価格条件から、買い時は強めです。");
  } else if (metrics.timingLevel === "普通") {
    reasons.push("買い時は普通で、急ぐ理由と待つ理由が混在しています。");
  } else {
    reasons.push("今すぐ急ぐ理由は弱めです。");
  }

  if (metrics.riskLevel === "高") {
    reasons.push("予算、価格、置き場所、積み化のどこかに強い危険信号があります。");
  } else if (metrics.riskLevel === "注意") {
    reasons.push("危険度は注意域です。買うなら予算や置き場所の確認が必要です。");
  } else {
    reasons.push("危険度は低めで、致命的なブレーキは今のところ小さいです。");
  }

  if (metrics.monthlyBudget <= 0) {
    reasons.push("予算未設定のため、予算安全性は未確認です。");
  }

  if (gateSource === "invalid_price") {
    reasons.push("現在価格が未入力のため、価格判断は保留です。");
  } else if (gateSource === "max_price_over") {
    reasons.push("現在価格が許容上限価格を超えているため、通常の買いにはできません。");
  } else if (gateSource === "budget_over") {
    reasons.push("現在価格が残り予算を超えているため、通常の買いにはできません。");
  } else if (gateSource === "price_unknown") {
    reasons.push("基準価格・目標価格・許容上限価格のいずれもないため、価格妥当性を判断できません。");
  } else if (gateSource === "target_wait") {
    reasons.push(metrics.targetGapRate >= 0.1
      ? "目標価格との差が大きく、強い価格待ち理由があります。"
      : "目標価格には少し届いておらず、軽い価格待ち理由があります。");
  }

  if (metrics.priceStatusKey === "baseOrBelow") {
    reasons.push("現在価格は基準価格以下です。");
  } else if (metrics.priceStatusKey === "nearBase") {
    reasons.push("現在価格はほぼ基準価格です。");
  } else if (metrics.priceStatusKey === "clearPremium") {
    reasons.push("現在価格は基準価格から明確に上乗せされています。");
  }

  if (adjustment.modeAdjustmentApplied && adjustment.modeAdjustmentSummary) {
    reasons.push(adjustment.modeAdjustmentSummary);
  }

  return reasons.slice(0, 6);
}

function buildReviewReasonTags(metrics, gateSource, adjustment) {
  const tags = [
    `desire_${getDesireLevelKey(metrics.desireScore)}`,
    `timing_${getTimingLevelKey(metrics.timingScore)}`,
    `risk_${getRiskLevelKey(metrics.riskScore)}`,
    `gate_${gateSource}`,
    `price_${metrics.priceStatusKey}`
  ];

  if (metrics.hardRisk) tags.push("hard_risk");
  if (metrics.targetPriceBonus > 0) tags.push("target_price_reached");
  if (adjustment.modeAdjustmentApplied) tags.push("mode_adjusted");

  return tags;
}

function getDesireLevelKey(desireScore) {
  if (desireScore >= 75) return "high";
  if (desireScore >= 55) return "medium";
  if (desireScore >= 45) return "low";
  return "very_low";
}

function getTimingLevelKey(timingScore) {
  if (timingScore >= 65) return "strong";
  if (timingScore >= 45) return "medium";
  return "weak";
}

function getRiskLevelKey(riskScore) {
  if (riskScore >= 60) return "high";
  if (riskScore >= 36) return "caution";
  return "low";
}

function judgePurchase(item, purchase, councilMode) {
  const purchasePrice = toNumber(purchase.purchasePrice);
  const listPrice = toNumber(item.listPrice);
  const registeredPrice = toNumber(item.registeredPrice);
  const remainingBudget = getRemainingBudget();
  const budgetImpact = getBudgetImpactText(purchasePrice, remainingBudget);
  const observations = [];

  if (listPrice > 0 && purchasePrice <= listPrice) {
    observations.push("基準価格以下で買えた");
  }

  if (registeredPrice > 0 && purchasePrice < registeredPrice) {
    observations.push("登録時価格より安く買えた");
  }

  if (registeredPrice > 0 && purchasePrice > registeredPrice) {
    observations.push("登録時価格より高く買った");
  }

  if (listPrice > 0 && purchasePrice > listPrice) {
    observations.push("基準価格より高く買った");
  }

  let judgment = "理性ある勝利";

  if (purchasePrice > remainingBudget) {
    judgment = "財政規律違反の疑い";
  } else if (purchase.purchaseType === "プレ値購入" || (listPrice > 0 && purchasePrice > listPrice)) {
    judgment = "転売屈服または危険な購入";
  } else if (purchase.purchaseType === "セール購入") {
    judgment = "良好な戦果";
  } else if (purchase.purchaseType === "中古購入") {
    judgment = "状態確認付きの勝利";
  } else if (registeredPrice > 0 && purchasePrice < registeredPrice) {
    judgment = "待った勝利";
  } else if (registeredPrice > 0 && purchasePrice > registeredPrice) {
    judgment = "判断遅延による損耗";
  }

  return {
    type: "purchase",
    councilMode,
    purchaseType: purchase.purchaseType,
    purchasePrice,
    purchasedAt: purchase.purchasedAt,
    judgment,
    budgetImpact,
    observations,
    comment: getPurchaseCouncilComment(councilMode, judgment, {
      purchaseType: purchase.purchaseType,
      purchasePrice,
      listPrice,
      registeredPrice,
      budgetImpact,
      observations
    })
  };
}

function createPurchaseHistoryEntry(verdict, purchase, item) {
  const analysis = buildPostPurchaseAnalysis(item, purchase, verdict);

  return {
    type: "purchase",
    postPurchaseVersion: POST_PURCHASE_VERSION,
    judgedAt: new Date().toISOString(),
    councilMode: verdict.councilMode,
    purchaseType: purchase.purchaseType,
    purchasePrice: purchase.purchasePrice,
    purchasedAt: purchase.purchasedAt,
    judgment: verdict.judgment,
    judgmentComment: verdict.comment,
    budgetImpact: verdict.budgetImpact,
    postPurchaseReasonLines: analysis.postPurchaseReasonLines,
    postPurchaseReasonTags: analysis.postPurchaseReasonTags,
    postPurchasePriceStatusKey: analysis.postPurchasePriceStatusKey,
    postPurchasePriceDeviationRate: analysis.postPurchasePriceDeviationRate,
    collectorLightDelta: analysis.collectorLightDelta,
    collectorDarkDelta: analysis.collectorDarkDelta,
    collectorBalanceReasonLines: analysis.collectorBalanceReasonLines,
    collectorBalanceReasonTags: analysis.collectorBalanceReasonTags,
    heartStockReversedAmount: purchase.heartStockReversedAmount || 0,
    wasSkippedBeforePurchase: Boolean(purchase.wasSkippedBeforePurchase)
  };
}

function createSkipHistoryEntry(item, addedHeartStock, skippedAt = new Date().toISOString()) {
  return {
    type: "skip",
    skipVersion: SKIP_HISTORY_VERSION,
    skippedAt,
    judgment: VALID_JUDGMENTS.includes(item.judgment) ? item.judgment : "",
    councilMode: getSelectableCouncilMode(item.councilMode),
    currentPrice: toNumber(item.currentPrice),
    listPrice: toNumber(item.listPrice),
    targetPrice: toNumber(item.targetPrice),
    maxAcceptablePrice: toNumber(item.maxAcceptablePrice),
    addedHeartStock: toNumber(addedHeartStock),
    reason: "user_confirmed_skip"
  };
}

function hasSkipHistory(item) {
  return Array.isArray(item && item.judgmentHistory) && item.judgmentHistory.some((entry) => entry && entry.type === "skip");
}

function buildPostPurchaseAnalysis(item, purchase, verdict) {
  const priceStatus = calculatePostPurchasePriceStatus(item, purchase);
  const context = {
    priceStatus,
    purchasePrice: toNumber(purchase.purchasePrice),
    listPrice: toNumber(item.listPrice),
    registeredPrice: toNumber(item.registeredPrice),
    targetPrice: toNumber(item.targetPrice),
    maxAcceptablePrice: toNumber(item.maxAcceptablePrice),
    wasSkippedBeforePurchase: Boolean(purchase.wasSkippedBeforePurchase),
    heartStockReversedAmount: toNumber(purchase.heartStockReversedAmount)
  };

  const reason = createPostPurchaseReasonSummary(item, purchase, verdict, context);
  const balance = calculateCollectorBalanceDelta(item, purchase, verdict, context);

  return {
    postPurchaseReasonLines: reason.lines,
    postPurchaseReasonTags: reason.tags,
    postPurchasePriceStatusKey: priceStatus.key,
    postPurchasePriceDeviationRate: priceStatus.deviationRate,
    collectorLightDelta: balance.light,
    collectorDarkDelta: balance.dark,
    collectorBalanceReasonLines: balance.lines,
    collectorBalanceReasonTags: balance.tags
  };
}

function calculatePostPurchasePriceStatus(item, purchase) {
  const priceBasisType = getDisplayPriceBasisType(item.priceBasisType);
  const listPrice = toNumber(item.listPrice);
  const purchasePrice = toNumber(purchase.purchasePrice);

  if (priceBasisType === UNKNOWN_PRICE_BASIS_TYPE || listPrice <= 0 || purchasePrice <= 0) {
    return {
      key: "notComparable",
      deviationRate: null
    };
  }

  const deviationRate = (purchasePrice - listPrice) / listPrice;
  let key = "clearPremium";

  if (purchasePrice <= listPrice) {
    key = "baseOrBelow";
  } else if (purchasePrice <= listPrice * 1.05) {
    key = "nearBase";
  } else if (purchasePrice <= listPrice * 1.2) {
    key = "slightPremium";
  }

  return {
    key,
    deviationRate: Number(deviationRate.toFixed(4))
  };
}

function createPostPurchaseReasonSummary(item, purchase, verdict, context) {
  const lines = [];
  const tags = [];
  const add = (line, tag) => addPostPurchaseAnalysisEntry(lines, tags, line, tag);

  add(`購入後判決は「${verdict.judgment}」です。`, getPostPurchaseJudgmentTag(verdict.judgment));

  if (context.priceStatus.key === "baseOrBelow") {
    add("購入価格は基準価格以下です。", "purchase_base_or_below");
  } else if (context.priceStatus.key !== "notComparable" && context.purchasePrice > context.listPrice) {
    add("購入価格は基準価格を上回っています。", "purchase_over_base");
  }

  if (context.targetPrice > 0 && context.purchasePrice > 0 && context.purchasePrice <= context.targetPrice) {
    add("目標価格に到達してから購入できています。", "target_price_reached");
  }

  if (context.maxAcceptablePrice > 0 && context.purchasePrice > context.maxAcceptablePrice) {
    add("許容上限価格を超えて購入しています。", "max_acceptable_price_over");
  }

  if (purchase.purchaseType === "セール購入") {
    add("セール購入として記録されています。", "sale_purchase");
  } else if (purchase.purchaseType === "プレ値購入") {
    add("プレ値購入として記録されています。", "premium_purchase");
  }

  if (context.registeredPrice > 0 && context.purchasePrice > 0 && context.purchasePrice < context.registeredPrice) {
    add("登録時価格より安く購入できています。", "lower_than_registered_price");
  } else if (context.registeredPrice > 0 && context.purchasePrice > context.registeredPrice) {
    add("登録時価格より高く購入しています。", "higher_than_registered_price");
  }

  if (item.judgment === "買い") {
    add("購入前審議では「買い」判定だったため、判断に一貫性があります。", "pre_review_buy");
  } else if (item.judgment === "見送り") {
    add("購入前審議では「見送り」判定だったため、見送り判断を突破した購入です。", "pre_review_skip");
  } else if (item.judgment === "危険な買い") {
    add("購入前審議では「危険な買い」判定だったため、警告を越えた購入です。", "pre_review_danger_buy");
  }

  if (item.hardRisk === true) {
    add("購入前審議で安全ゲートに該当していたため、慎重さが必要な購入です。", "pre_review_hard_risk");
  }

  if (item.gateSource === "price_unknown") {
    add("購入前審議では価格判断の基準が不足していました。", "pre_review_price_unknown");
  }

  if (item.gateSource === "target_wait" && context.targetPrice > 0 && context.purchasePrice > 0 && context.purchasePrice <= context.targetPrice) {
    add("購入前審議の価格待ち理由に対して、目標価格に届いてから購入できています。", "target_wait_success");
  }

  if (context.wasSkippedBeforePurchase) {
    add("いったん見送った後に再判断して購入しています。", "was_skipped_before_purchase");

    if (context.targetPrice > 0 && context.purchasePrice > 0 && context.purchasePrice <= context.targetPrice) {
      add("見送り後に目標価格へ届いたため、待った価値がありました。", "skipped_then_target_reached");
    }

    if (purchase.purchaseType === "プレ値購入") {
      add("見送り後にプレ値購入へ進んだため、衝動の再燃に注意が必要です。", "skipped_then_premium_purchase");
    }
  }

  if (context.heartStockReversedAmount > 0) {
    add("見送り時に加算した心のヘソクリを購入確定時に差し戻しています。", "heart_stock_reversed");
  }

  return { lines, tags };
}

function calculateCollectorBalanceDelta(item, purchase, verdict, context) {
  const lines = [];
  const tags = [];
  let light = 0;
  let dark = 0;
  const add = (line, tag, lightDelta = 0, darkDelta = 0) => {
    light += lightDelta;
    dark += darkDelta;
    addPostPurchaseAnalysisEntry(lines, tags, line, tag);
  };

  const base = getPostPurchaseJudgmentBalance(verdict.judgment);
  if (base.light > 0 || base.dark > 0) {
    add(base.line, base.tag, base.light, base.dark);
  }

  if (context.priceStatus.key === "baseOrBelow") {
    add("基準価格以下で購入できたため、ライトサイドが増えました。", "purchase_base_or_below", 1, 0);
  } else if (context.priceStatus.key !== "notComparable" && context.purchasePrice > context.listPrice) {
    add("基準価格を超えているため、ダークサイドが増えました。", "purchase_over_base", 0, 2);
  }

  if (context.targetPrice > 0 && context.purchasePrice > 0 && context.purchasePrice <= context.targetPrice) {
    add("目標価格に到達していたため、ライトサイドが増えました。", "target_price_reached", 2, 0);
  }

  if (context.maxAcceptablePrice > 0 && context.purchasePrice > context.maxAcceptablePrice) {
    add("許容上限価格を超えているため、ダークサイドが増えました。", "max_acceptable_price_over", 0, 3);
  }

  if (purchase.purchaseType === "セール購入") {
    add("セール購入のため、ライトサイドが増えました。", "sale_purchase", 2, 0);
  } else if (purchase.purchaseType === "プレ値購入") {
    add("プレ値購入のため、ダークサイドが増えました。", "premium_purchase", 0, 4);
  }

  if (context.registeredPrice > 0 && context.purchasePrice > 0 && context.purchasePrice < context.registeredPrice) {
    add("登録時価格より安く購入できたため、ライトサイドが増えました。", "lower_than_registered_price", 2, 0);
  } else if (context.registeredPrice > 0 && context.purchasePrice > context.registeredPrice) {
    add("登録時価格より高く購入しているため、ダークサイドが増えました。", "higher_than_registered_price", 0, 2);
  }

  if (item.judgment === "買い") {
    add("購入前の買い判定と一貫しているため、ライトサイドが増えました。", "pre_review_buy", 1, 0);
  } else if (item.judgment === "見送り") {
    add("購入前の見送り判定を突破しているため、ダークサイドが増えました。", "pre_review_skip", 0, 2);
  } else if (item.judgment === "危険な買い") {
    add("購入前の警告を突破しているため、ダークサイドが増えました。", "pre_review_danger_buy", 0, 3);
  }

  if (item.hardRisk === true) {
    add("購入前の安全ゲートを突破しているため、ダークサイドが増えました。", "pre_review_hard_risk", 0, 2);
  }

  if (item.gateSource === "price_unknown") {
    add("購入前に価格判断の基準が不足していたため、ダークサイドが少し増えました。", "pre_review_price_unknown", 0, 1);
  }

  if (item.gateSource === "target_wait" && context.targetPrice > 0 && context.purchasePrice > 0 && context.purchasePrice <= context.targetPrice) {
    add("価格待ちの後に目標価格へ届いたため、ライトサイドが増えました。", "target_wait_success", 2, 0);
  }

  if (context.wasSkippedBeforePurchase) {
    add("見送り後に購入したため、ダークサイドが少し増えました。", "was_skipped_before_purchase", 0, 1);

    if (context.targetPrice > 0 && context.purchasePrice > 0 && context.purchasePrice <= context.targetPrice) {
      add("見送り後に目標価格へ届いたため、ライトサイドが増えました。", "skipped_then_target_reached", 1, 0);
    }

    if (purchase.purchaseType === "プレ値購入") {
      add("見送り後にプレ値購入へ進んだため、ダークサイドが増えました。", "skipped_then_premium_purchase", 0, 2);
    }
  }

  return { light, dark, lines, tags };
}

function addPostPurchaseAnalysisEntry(lines, tags, line, tag) {
  if (line && !lines.includes(line)) {
    lines.push(line);
  }

  if (tag && !tags.includes(tag)) {
    tags.push(tag);
  }
}

function getPostPurchaseJudgmentTag(judgment) {
  const tags = {
    "理性ある勝利": "post_judgment_reasonable_victory",
    "待った勝利": "post_judgment_waiting_victory",
    "良好な戦果": "post_judgment_good_result",
    "状態確認付きの勝利": "post_judgment_condition_checked_victory",
    "判断遅延による損耗": "post_judgment_delayed_loss",
    "転売屈服または危険な購入": "post_judgment_danger_purchase",
    "財政規律違反の疑い": "post_judgment_budget_discipline_warning"
  };

  return tags[judgment] || "post_judgment_unknown";
}

function getPostPurchaseJudgmentBalance(judgment) {
  const balances = {
    "理性ある勝利": { light: 3, dark: 0, line: "理性的な購入後判決のため、ライトサイドが増えました。" },
    "待った勝利": { light: 4, dark: 0, line: "待った価値がある購入後判決のため、ライトサイドが増えました。" },
    "良好な戦果": { light: 4, dark: 0, line: "良好な戦果として、ライトサイドが増えました。" },
    "状態確認付きの勝利": { light: 2, dark: 0, line: "状態確認付きの勝利として、ライトサイドが増えました。" },
    "判断遅延による損耗": { light: 1, dark: 2, line: "判断遅延による損耗として、ライトサイドとダークサイドの両方が増えました。" },
    "転売屈服または危険な購入": { light: 0, dark: 5, line: "危険な購入後判決のため、ダークサイドが増えました。" },
    "財政規律違反の疑い": { light: 0, dark: 6, line: "財政規律違反の疑いがあるため、ダークサイドが増えました。" }
  };
  const balance = balances[judgment] || { light: 0, dark: 0, line: "購入後判決に対応するライト/ダーク基本点はありません。" };

  return {
    ...balance,
    tag: getPostPurchaseJudgmentTag(judgment)
  };
}

function calculateLegoRarityRisk(releaseDate) {
  if (!releaseDate) {
    return null;
  }

  const releasedAt = new Date(`${releaseDate}T00:00:00`);
  if (Number.isNaN(releasedAt.getTime())) {
    return null;
  }

  const today = new Date();
  let months =
    (today.getFullYear() - releasedAt.getFullYear()) * 12 +
    (today.getMonth() - releasedAt.getMonth());

  if (today.getDate() < releasedAt.getDate()) {
    months -= 1;
  }

  const elapsedMonths = Math.max(0, months);
  let level = 1;

  if (elapsedMonths >= 25) level = 5;
  else if (elapsedMonths >= 19) level = 4;
  else if (elapsedMonths >= 13) level = 3;
  else if (elapsedMonths >= 7) level = 2;

  return {
    elapsedMonths,
    level,
    score: level * 2
  };
}

function getBudgetImpactText(currentPrice, remainingBudget) {
  if (currentPrice > remainingBudget) {
    return `残り予算を${formatYen(currentPrice - remainingBudget)}超過します。`;
  }

  if (currentPrice >= remainingBudget * 0.8 && remainingBudget > 0) {
    return "残り予算の大部分を使います。";
  }

  return "残り予算内で処理できます。";
}

function calculatePriceStatus(item) {
  const priceBasisType = getDisplayPriceBasisType(item.priceBasisType);
  const listPrice = toNumber(item.listPrice);
  const currentPrice = toNumber(item.currentPrice);

  if (priceBasisType === UNKNOWN_PRICE_BASIS_TYPE || listPrice <= 0 || currentPrice <= 0) {
    return {
      key: "notComparable",
      label: "価格比較不可",
      detail: "比較できる基準価格または現在価格がありません。"
    };
  }

  let statusKey = "clearPremium";
  if (currentPrice <= listPrice) {
    statusKey = "baseOrBelow";
  } else if (currentPrice <= listPrice * 1.05) {
    statusKey = "nearBase";
  } else if (currentPrice <= listPrice * 1.2) {
    statusKey = "slightPremium";
  }

  return {
    key: statusKey,
    label: getPriceStatusLabel(priceBasisType, statusKey),
    detail: `基準価格 ${formatYen(listPrice)} / 現在価格 ${formatYen(currentPrice)}`
  };
}

function getPriceStatusLabel(priceBasisType, statusKey) {
  const labels = {
    "定価を基準にする": {
      baseOrBelow: "定価以下・セール",
      nearBase: "ほぼ定価",
      slightPremium: "軽いプレ値",
      clearPremium: "明確なプレ値"
    },
    "中古相場を基準にする": {
      baseOrBelow: "相場以下",
      nearBase: "ほぼ相場",
      slightPremium: "やや相場超え",
      clearPremium: "明確な相場超え"
    },
    "参考相場を基準にする": {
      baseOrBelow: "参考相場以下",
      nearBase: "ほぼ参考相場",
      slightPremium: "やや高め",
      clearPremium: "明確に高め"
    }
  };

  return labels[priceBasisType]?.[statusKey] || "価格比較不可";
}

// ==============================
// 評議会コメント
// ==============================

function getCouncilComment(mode, judgment, budgetImpact) {
  // 購入前審議フロー全体のコメントを組み立てます。
  // 「通常審議モード」は評議会モードの1つであり、この関数は全モード共通です。
  const baseComment = getPrePurchaseComment(mode, judgment);

  return `${baseComment}\n\n予算影響：${budgetImpact}`;
}

function getPurchaseCouncilComment(mode, judgment, details) {
  const baseComment = getPostPurchaseComment(mode, judgment);
  const observationText = details.observations.length > 0
    ? `\n\n判定材料：${details.observations.join(" / ")}`
    : "";

  return `${baseComment}\n\n購入区分：${details.purchaseType}\n購入価格：${formatYen(details.purchasePrice)}\n予算影響：${details.budgetImpact}${observationText}`;
}

function getPrePurchaseComment(councilMode, judgment) {
  return getCommentFromLibrary("prePurchase", councilMode, judgment, `判決：${judgment}\n\n評議会コメントが未登録です。`);
}

function getPostPurchaseComment(councilMode, purchaseJudgment) {
  return getCommentFromLibrary("postPurchase", councilMode, purchaseJudgment, `判決：${purchaseJudgment}\n\n購入後評議会コメントが未登録です。`);
}

function getCommentFromLibrary(sectionName, councilMode, judgment, fallbackText) {
  const library = typeof COMMENT_LIBRARY === "object" && COMMENT_LIBRARY ? COMMENT_LIBRARY : {};
  const section = library[sectionName] || {};
  const modeComments = section[councilMode] || section[FALLBACK_COUNCIL_MODE] || {};
  const fallbackModeComments = section[FALLBACK_COUNCIL_MODE] || {};
  const candidates = modeComments[judgment] || fallbackModeComments[judgment] || [];

  if (!Array.isArray(candidates) || candidates.length === 0) {
    return fallbackText;
  }

  const index = Math.floor(Math.random() * candidates.length);
  return candidates[index];
}

function getRecommendedAction(judgment) {
  if (judgment === "買い") return "購入してもよさそうです。届いたら開封までを任務にしましょう。";
  if (judgment === "保留") return "48時間後に再審議しましょう。価格か気持ちが動いたら更新してください。";
  if (judgment === "危険な買い") return "買うなら、置き場所か別の購入予定をひとつ調整しましょう。";
  return "今回は見送り候補です。見送った場合は心のヘソクリに加算できます。";
}

// ==============================
// 画面描画
// ==============================

function renderAll() {
  renderTabs();
  renderSettingsForm();
  renderDataManagementStatus();
  renderSummary();
  renderConsideringFilters();
  renderItems();
  renderRecentHistory();
}

function renderTabs() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    const isActive = button.dataset.tab === activeTab;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  document.querySelectorAll(".tab-panel").forEach((panel) => {
    panel.classList.toggle("hidden", panel.dataset.tabPanel !== activeTab);
  });
}

function renderSettingsForm() {
  document.querySelector("#monthlyBudgetInput").value = settings.monthlyBudget || "";
  document.querySelector("#budgetStartDateInput").value = settings.budgetStartDate || "";
  document.querySelector("#budgetEndDateInput").value = settings.budgetEndDate || "";
  fillSelect("#defaultCouncilModeInput", COUNCIL_MODES, getSelectableCouncilMode(settings.defaultCouncilMode));
  fillSelect("#councilModeInput", COUNCIL_MODES, getSelectableCouncilMode(settings.defaultCouncilMode));
  fillSelect("#itemTypeInput", ITEM_TYPE_OPTIONS, DEFAULT_ITEM_TYPE);
  fillSelect("#priceBasisTypeInput", PRICE_BASIS_TYPES, DEFAULT_PRICE_BASIS_TYPE);
  updateCurrentPriceField();
  updateLegoReleaseDateField();
  updatePriceBasisField();
  renderFormPriceStatus();
}

function renderDataManagementStatus() {
  setText("#lastExportedAtText", settings.lastExportedAt ? formatDateTime(settings.lastExportedAt) : "未実行");
  setText("#lastImportedAtText", settings.lastImportedAt ? formatDateTime(settings.lastImportedAt) : "未実行");
}

function renderSummary() {
  const counts = getItemStatusCounts();
  const judgmentCounts = getConsideringJudgmentCounts();
  const collectorBalance = calculateCollectorBalanceSummary(items);
  const monthlySpent = getMonthlySpent();
  const remainingBudget = getRemainingBudget();

  setText("#monthlyBudgetText", formatYen(settings.monthlyBudget));
  setText("#monthlySpentText", formatYen(monthlySpent));
  setText("#remainingBudgetText", formatYen(remainingBudget));
  setText("#heartStockText", formatYen(settings.heartStock));
  setText("#budgetPeriodText", `${formatDisplayDate(settings.budgetStartDate)} 〜 ${formatDisplayDate(settings.budgetEndDate)}`);
  setText("#itemCountText", String(items.length));
  setText("#consideringCountText", String(counts.considering));
  setText("#purchasedCountText", String(counts.purchased));
  setText("#skippedStatusCountText", String(counts.skipped));
  setText("#unreviewedCountText", `${judgmentCounts.unreviewed}件`);
  setText("#holdJudgmentCountText", `${judgmentCounts.hold}件`);
  setText("#skipJudgmentCountText", `${judgmentCounts.skipJudgment}件`);
  setText("#collectorLightTotalText", String(collectorBalance.totalLight));
  setText("#collectorDarkTotalText", String(collectorBalance.totalDark));
  setText("#collectorObservedPurchaseCountText", `${collectorBalance.observedPurchaseHistoryCount}件`);
  setText("#collectorBalanceTitleText", collectorBalance.title);
  setText("#collectorBalanceDescriptionText", collectorBalance.description);
  renderSummaryGauges(collectorBalance, monthlySpent);
}

// 表示専用：受付端末の予算ゲージとコレクター属性メーターの幅だけを更新する。
// 集計値は renderSummary が受け取った計算結果をそのまま使い、保存データには触れない。
function renderSummaryGauges(collectorBalance, monthlySpent) {
  const budgetGauge = document.querySelector("#budgetGaugeFill");
  if (budgetGauge) {
    const budget = toNumber(settings.monthlyBudget);
    const spent = toNumber(monthlySpent);
    const isOverBudget = budget > 0 && spent > budget;
    const remainingRate = budget > 0 ? clamp(((budget - spent) / budget) * 100, 0, 100) : 0;
    budgetGauge.style.width = isOverBudget ? "100%" : `${remainingRate}%`;
    budgetGauge.classList.toggle("gauge-over", isOverBudget);
  }

  const totalLight = toNumber(collectorBalance.totalLight);
  const totalDark = toNumber(collectorBalance.totalDark);

  const lightMeter = document.querySelector("#collectorLightMeterFill");
  const darkMeter = document.querySelector("#collectorDarkMeterFill");
  if (lightMeter && darkMeter) {
    const totalObserved = totalLight + totalDark;
    lightMeter.style.width = totalObserved > 0 ? `${(totalLight / totalObserved) * 47}%` : "0%";
    darkMeter.style.width = totalObserved > 0 ? `${(totalDark / totalObserved) * 47}%` : "0%";
  }

  const balancePanel = document.querySelector(".collector-balance-panel");
  if (balancePanel) {
    balancePanel.classList.toggle("dark-dominant", totalDark > totalLight);
  }
}

function renderConsideringFilters() {
  const filterBar = document.querySelector("#consideringFilterBar");
  const counts = getConsideringJudgmentCounts();

  filterBar.innerHTML = "";

  CONSIDERING_FILTERS.forEach((filter) => {
    const button = document.createElement("button");
    const isActive = filter.key === consideringFilter;
    button.type = "button";
    button.className = `sub-filter-button${isActive ? " active" : ""}`;
    button.dataset.filter = filter.key;
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
    button.innerHTML = `<span>${escapeHtml(filter.label)}</span><strong>${counts[filter.key]}</strong>`;
    filterBar.appendChild(button);
  });
}

function renderItems() {
  renderItemsForTab("considering", "#consideringItemsList", "#consideringEmptyState");
  renderItemsForTab("purchased", "#purchasedItemsList", "#purchasedEmptyState");
  renderItemsForTab("skipped", "#skippedItemsList", "#skippedEmptyState");
}

function renderItemsForTab(tabName, listSelector, emptySelector) {
  const itemsList = document.querySelector(listSelector);
  const emptyState = document.querySelector(emptySelector);
  const tabItems = getItemsForTab(tabName);

  itemsList.innerHTML = "";
  emptyState.classList.toggle("hidden", tabItems.length > 0);

  tabItems
    .slice()
    .sort(sortItemsByRecentUpdate)
    .forEach((item) => {
      itemsList.appendChild(createItemCard(item));
    });
}

function renderRecentHistory() {
  const list = document.querySelector("#recentHistoryList");
  const emptyState = document.querySelector("#recentHistoryEmpty");
  const entries = getRecentHistoryEntries();

  list.innerHTML = "";
  emptyState.classList.toggle("hidden", entries.length > 0);

  entries.forEach((entry) => {
    const row = document.createElement("article");
    row.className = "recent-history-item";
    row.innerHTML = `
      <span>${escapeHtml(formatDateTime(entry.judgedAt))}</span>
      <strong>${escapeHtml(entry.itemName)} / ${escapeHtml(entry.typeLabel)} / ${escapeHtml(entry.judgment)}</strong>
      <small>${escapeHtml(entry.councilMode || "")}</small>
    `;
    list.appendChild(row);
  });
}

function getRecentHistoryEntries() {
  return items
    .flatMap((item) => (item.judgmentHistory || []).map((entry) => ({
      ...entry,
      itemName: item.name,
      typeLabel: getHistoryTypeLabel(entry),
      judgedAt: getHistoryEntryDate(entry)
    })))
    .sort((a, b) => new Date(b.judgedAt) - new Date(a.judgedAt))
    .slice(0, 5);
}

function getHistoryTypeLabel(entry) {
  if (entry && entry.type === "purchase") return "購入後評議会";
  if (entry && entry.type === "skip") return "見送り確定";
  return "購入前審議";
}

function getHistoryEntryDate(entry) {
  if (!entry) return "";
  if (entry.type === "purchase") return entry.judgedAt || entry.purchasedAt || "";
  if (entry.type === "skip") return entry.skippedAt || "";
  return entry.judgedAt || "";
}

function sortItemsByRecentUpdate(a, b) {
  const timeA = getItemSortTime(a);
  const timeB = getItemSortTime(b);

  if (timeA === timeB) {
    return 0;
  }

  return timeB - timeA;
}

function getItemSortTime(item) {
  const dateValue = item.updatedAt || item.createdAt || "";
  const timestamp = new Date(dateValue).getTime();

  return Number.isNaN(timestamp) ? 0 : timestamp;
}

// ==============================
// AI相場調査JSON v1
// ==============================

const MARKET_RESEARCH_REQUIRED_SECTIONS = [
  "target",
  "researchMeta",
  "priceSummary",
  "availabilitySummary",
  "summaries"
];

const MARKET_RESEARCH_OPTIONAL_OBJECT_SECTIONS = [
  "marketSignals",
  "purchaseTiming"
];

const MARKET_RESEARCH_PRICE_PATHS = [
  "target.referencePrice",
  "priceSummary.marketPriceMin",
  "priceSummary.marketPriceTypical",
  "priceSummary.marketPriceMax",
  "priceSummary.lowestObservedPrice",
  "priceSummary.highestObservedPrice",
  "priceSummary.officialPrice",
  "priceSummary.usedPriceMin",
  "priceSummary.usedPriceTypical",
  "priceSummary.discountRateVsReference",
  "marketSignals.premiumRate",
  "purchaseTiming.nextCheckPrice"
];

function createDefaultMarketResearchSource() {
  return {
    name: "",
    url: "",
    shopType: "",
    price: null,
    currency: "JPY",
    stockStatus: "unknown",
    condition: "new",
    shippingFee: null,
    checkedAt: ""
  };
}

function createDefaultMarketResearch() {
  return {
    schemaVersion: MARKET_RESEARCH_SCHEMA_VERSION,
    target: {
      productName: "",
      maker: "",
      brand: "",
      category: "",
      modelNumber: "",
      productUrl: "",
      releaseDate: "",
      referencePrice: null,
      referencePriceType: "listPrice"
    },
    researchMeta: {
      researchedAt: "",
      researchedBy: "ChatGPT",
      researchPromptVersion: MARKET_RESEARCH_PROMPT_VERSION,
      confidence: "medium",
      userVerified: false,
      note: ""
    },
    priceSummary: {
      currency: "JPY",
      marketPriceMin: null,
      marketPriceTypical: null,
      marketPriceMax: null,
      lowestObservedPrice: null,
      highestObservedPrice: null,
      officialPrice: null,
      usedPriceMin: null,
      usedPriceTypical: null,
      shippingIncluded: "mixed",
      discountRateVsReference: null
    },
    availabilitySummary: {
      stockStatus: "unknown",
      availability: "unknown",
      supplyStatus: "unknown",
      soldOutRisk: "unknown",
      restockLikelihood: "unknown",
      limitedOrRegular: "unknown"
    },
    marketSignals: {
      priceTrend: "unknown",
      resalePressure: "unknown",
      premiumRate: null,
      demandSignal: "unknown",
      volatility: "unknown",
      releasePhase: "unknown",
      saleLikelihood: "unknown"
    },
    purchaseTiming: {
      urgency: "unknown",
      waitReason: "",
      buyNowReason: "",
      nextCheckTrigger: "",
      nextCheckPrice: null
    },
    summaries: {
      marketSummary: "",
      priceComment: "",
      availabilityComment: "",
      cautionComment: ""
    },
    cautions: [],
    sources: []
  };
}

function isPlainObject(value) {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function normalizeMarketResearchSection(defaultSection, sourceSection) {
  const source = isPlainObject(sourceSection) ? sourceSection : {};
  const normalized = {};

  Object.entries(defaultSection).forEach(([key, defaultValue]) => {
    const value = source[key];
    if (defaultValue === null) {
      normalized[key] = value === null || value === undefined
        ? null
        : (typeof value === "number" && Number.isFinite(value) ? value : null);
    } else if (typeof defaultValue === "boolean") {
      normalized[key] = typeof value === "boolean" ? value : defaultValue;
    } else {
      normalized[key] = typeof value === "string" ? value : defaultValue;
    }
  });

  return normalized;
}

function hasMarketResearchSourceContent(source) {
  return Boolean(
    source.name ||
    source.url ||
    source.shopType ||
    source.price !== null ||
    source.shippingFee !== null ||
    source.checkedAt ||
    source.stockStatus !== "unknown"
  );
}

function mergeWithDefaultMarketResearch(sourceResearch) {
  const source = isPlainObject(sourceResearch) ? sourceResearch : {};
  const defaults = createDefaultMarketResearch();
  const sources = Array.isArray(source.sources)
    ? source.sources
      .filter(isPlainObject)
      .map((entry) => normalizeMarketResearchSection(createDefaultMarketResearchSource(), entry))
      .filter(hasMarketResearchSourceContent)
    : [];

  return {
    schemaVersion: MARKET_RESEARCH_SCHEMA_VERSION,
    target: normalizeMarketResearchSection(defaults.target, source.target),
    researchMeta: normalizeMarketResearchSection(defaults.researchMeta, source.researchMeta),
    priceSummary: normalizeMarketResearchSection(defaults.priceSummary, source.priceSummary),
    availabilitySummary: normalizeMarketResearchSection(defaults.availabilitySummary, source.availabilitySummary),
    marketSignals: normalizeMarketResearchSection(defaults.marketSignals, source.marketSignals),
    purchaseTiming: normalizeMarketResearchSection(defaults.purchaseTiming, source.purchaseTiming),
    summaries: normalizeMarketResearchSection(defaults.summaries, source.summaries),
    cautions: Array.isArray(source.cautions)
      ? source.cautions.filter((entry) => typeof entry === "string")
      : [],
    sources,
    importedAt: typeof source.importedAt === "string" ? source.importedAt : "",
    importSource: typeof source.importSource === "string" ? source.importSource : ""
  };
}

function normalizeMarketResearchHistory(history) {
  if (!Array.isArray(history)) return [];
  return history
    .filter(isPlainObject)
    .map(mergeWithDefaultMarketResearch);
}

function getNestedValue(source, path) {
  return path.split(".").reduce((value, key) => (
    value && typeof value === "object" ? value[key] : undefined
  ), source);
}

function collectMissingMarketResearchPaths(source, template = createDefaultMarketResearch(), prefix = "") {
  const target = isPlainObject(source) ? source : {};
  const missingPaths = [];

  Object.entries(template).forEach(([key, defaultValue]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    if (!Object.prototype.hasOwnProperty.call(target, key)) {
      missingPaths.push(path);
      return;
    }

    if (isPlainObject(defaultValue)) {
      if (isPlainObject(target[key])) {
        missingPaths.push(...collectMissingMarketResearchPaths(target[key], defaultValue, path));
      } else {
        missingPaths.push(path);
      }
    }
  });

  return missingPaths;
}

function validateMarketResearchPayload(sourceResearch) {
  const errors = [];
  const warnings = [];

  if (!isPlainObject(sourceResearch)) {
    return {
      errors: ["相場調査JSONのルートはオブジェクトである必要があります。"],
      warnings,
      missingPaths: []
    };
  }

  if (sourceResearch.schemaVersion !== MARKET_RESEARCH_SCHEMA_VERSION) {
    errors.push(`この相場調査JSONのschemaVersionには対応していません。対応バージョン: ${MARKET_RESEARCH_SCHEMA_VERSION}`);
  }

  MARKET_RESEARCH_REQUIRED_SECTIONS.forEach((sectionName) => {
    if (!isPlainObject(sourceResearch[sectionName])) {
      errors.push(`必須構造 ${sectionName} がありません。`);
    }
  });

  MARKET_RESEARCH_OPTIONAL_OBJECT_SECTIONS.forEach((sectionName) => {
    if (sourceResearch[sectionName] !== undefined && !isPlainObject(sourceResearch[sectionName])) {
      errors.push(`${sectionName} はオブジェクトである必要があります。`);
    }
  });

  MARKET_RESEARCH_PRICE_PATHS.forEach((path) => {
    const value = getNestedValue(sourceResearch, path);
    if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
      errors.push(`${path} は number または null で入力してください。`);
    }
  });

  if (sourceResearch.sources !== undefined && !Array.isArray(sourceResearch.sources)) {
    errors.push("sources は配列である必要があります。");
  } else if (Array.isArray(sourceResearch.sources)) {
    sourceResearch.sources.forEach((source, index) => {
      if (!isPlainObject(source)) {
        errors.push(`sources[${index}] はオブジェクトである必要があります。`);
        return;
      }

      if (source.url !== undefined && typeof source.url !== "string") {
        errors.push(`sources[${index}].url は文字列で入力してください。`);
      }

      for (const field of ["price", "shippingFee"]) {
        const value = source[field];
        if (value !== undefined && value !== null && (typeof value !== "number" || !Number.isFinite(value))) {
          errors.push(`sources[${index}].${field} は number または null で入力してください。`);
        }
      }
    });
  }

  if (sourceResearch.cautions !== undefined) {
    if (!Array.isArray(sourceResearch.cautions)) {
      errors.push("cautions は配列である必要があります。");
    } else if (sourceResearch.cautions.some((entry) => typeof entry !== "string")) {
      errors.push("cautions は文字列の配列で入力してください。");
    }
  }

  if (sourceResearch.target && sourceResearch.target.productUrl !== undefined && typeof sourceResearch.target.productUrl !== "string") {
    errors.push("target.productUrl は文字列で入力してください。");
  }

  if (sourceResearch.researchMeta && sourceResearch.researchMeta.userVerified !== undefined && typeof sourceResearch.researchMeta.userVerified !== "boolean") {
    errors.push("researchMeta.userVerified は boolean で入力してください。");
  }

  const marketPriceMin = getNestedValue(sourceResearch, "priceSummary.marketPriceMin");
  const marketPriceTypical = getNestedValue(sourceResearch, "priceSummary.marketPriceTypical");
  const marketPriceMax = getNestedValue(sourceResearch, "priceSummary.marketPriceMax");
  if ([marketPriceMin, marketPriceTypical, marketPriceMax].every((value) => typeof value === "number" && Number.isFinite(value))) {
    if (!(marketPriceMin <= marketPriceTypical && marketPriceTypical <= marketPriceMax)) {
      warnings.push("価格帯の大小関係が不自然です。marketPriceMin <= marketPriceTypical <= marketPriceMax を確認してください。");
    }
  }

  if (!getNestedValue(sourceResearch, "target.productName")) {
    warnings.push("target.productName が空です。");
  }
  if (!getNestedValue(sourceResearch, "researchMeta.researchedAt")) {
    warnings.push("researchMeta.researchedAt（調査日）が空です。");
  }
  if (!getNestedValue(sourceResearch, "priceSummary.currency")) {
    warnings.push("priceSummary.currency が空です。JPYとして補完します。");
  }
  if (!getNestedValue(sourceResearch, "summaries.marketSummary")) {
    warnings.push("summaries.marketSummary が空です。");
  }
  if (!Array.isArray(sourceResearch.sources) || sourceResearch.sources.length === 0) {
    warnings.push("情報源が0件です。");
  }

  const missingPaths = collectMissingMarketResearchPaths(sourceResearch);
  if (missingPaths.length > 0) {
    const examples = missingPaths.slice(0, 6).join("、");
    const suffix = missingPaths.length > 6 ? ` ほか${missingPaths.length - 6}件` : "";
    warnings.push(`不足項目をデフォルト値で補完します: ${examples}${suffix}`);
  }

  return {
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
    missingPaths
  };
}

function tryParseJsonObject(candidateText) {
  try {
    const parsed = JSON.parse(candidateText);
    return isPlainObject(parsed) ? parsed : null;
  } catch (error) {
    return null;
  }
}

function extractFirstJsonObjectText(text) {
  for (let startIndex = text.indexOf("{"); startIndex >= 0; startIndex = text.indexOf("{", startIndex + 1)) {
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = startIndex; index < text.length; index += 1) {
      const character = text[index];

      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === '"') {
          inString = false;
        }
        continue;
      }

      if (character === '"') {
        inString = true;
      } else if (character === "{") {
        depth += 1;
      } else if (character === "}") {
        depth -= 1;
        if (depth === 0) {
          const candidate = text.slice(startIndex, index + 1);
          if (tryParseJsonObject(candidate)) {
            return candidate;
          }
          break;
        }
      }
    }
  }

  return "";
}

function parseMarketResearchJsonText(inputText) {
  if (typeof inputText !== "string" || !inputText.trim()) {
    return {
      ok: false,
      error: "AI相場調査JSONを貼り付けてください。"
    };
  }

  const trimmedText = inputText.trim();
  const directParsed = tryParseJsonObject(trimmedText);
  if (directParsed) {
    return { ok: true, value: directParsed, extractedFrom: "json-object" };
  }

  const codeBlockPattern = /```(?:json)?\s*([\s\S]*?)```/gi;
  let codeBlockMatch = codeBlockPattern.exec(trimmedText);
  while (codeBlockMatch) {
    const codeBlockParsed = tryParseJsonObject(codeBlockMatch[1].trim());
    if (codeBlockParsed) {
      return { ok: true, value: codeBlockParsed, extractedFrom: "json-code-block" };
    }
    codeBlockMatch = codeBlockPattern.exec(trimmedText);
  }

  const extractedObjectText = extractFirstJsonObjectText(trimmedText);
  const extractedObject = extractedObjectText ? tryParseJsonObject(extractedObjectText) : null;
  if (extractedObject) {
    return { ok: true, value: extractedObject, extractedFrom: "answer-text" };
  }

  return {
    ok: false,
    error: "JSON部分を読み取れませんでした。回答末尾のJSONコードブロック、またはJSONオブジェクト部分だけを貼り付けてください。"
  };
}

function normalizeComparableMarketResearchText(value) {
  return String(value || "").trim().toLocaleLowerCase("ja-JP").replace(/\s+/g, " ");
}

function normalizeComparableUrl(value) {
  return String(value || "").trim().replace(/\/+$/, "");
}

function areMarketResearchPricesSimilar(firstResearch, secondResearch) {
  const priceKeys = ["marketPriceTypical", "marketPriceMin", "marketPriceMax"];
  return priceKeys.some((priceKey) => {
    const firstPrice = firstResearch.priceSummary[priceKey];
    const secondPrice = secondResearch.priceSummary[priceKey];
    if (typeof firstPrice !== "number" || typeof secondPrice !== "number") return false;
    const allowedDifference = Math.max(100, Math.max(Math.abs(firstPrice), Math.abs(secondPrice)) * 0.05);
    return Math.abs(firstPrice - secondPrice) <= allowedDifference;
  });
}

function createMarketResearchItemWarnings(item, marketResearch) {
  const warnings = [];
  const target = marketResearch.target;
  const comparisons = [
    ["商品名", item.name, target.productName],
    ["メーカー・ブランド", item.maker, target.maker || target.brand],
    ["型番", item.modelNumber, target.modelNumber]
  ];

  comparisons.forEach(([label, itemValue, researchValue]) => {
    if (!itemValue || !researchValue) return;
    if (normalizeComparableMarketResearchText(itemValue) !== normalizeComparableMarketResearchText(researchValue)) {
      warnings.push(`${label}が登録商品と一致しない可能性があります。登録商品: ${itemValue} / 調査結果: ${researchValue}`);
    }
  });

  if (item.productUrl && target.productUrl && normalizeComparableUrl(item.productUrl) !== normalizeComparableUrl(target.productUrl)) {
    warnings.push(`商品URLが登録商品と一致しない可能性があります。登録商品: ${item.productUrl} / 調査結果: ${target.productUrl}`);
  }

  const researchedAt = normalizeComparableMarketResearchText(marketResearch.researchMeta.researchedAt);
  const productName = normalizeComparableMarketResearchText(target.productName);
  const hasPossibleDuplicate = normalizeMarketResearchHistory(item.marketResearchHistory).some((entry) => (
    researchedAt &&
    productName &&
    normalizeComparableMarketResearchText(entry.researchMeta.researchedAt) === researchedAt &&
    normalizeComparableMarketResearchText(entry.target.productName) === productName &&
    areMarketResearchPricesSimilar(entry, marketResearch)
  ));

  if (hasPossibleDuplicate) {
    warnings.push("同じ調査日・同じ商品らしい相場調査結果がすでに保存されています。重複して保存する場合は内容を確認してください。");
  }

  return warnings;
}

function prepareMarketResearchImport(item, inputText) {
  const parsedResult = parseMarketResearchJsonText(inputText);
  if (!parsedResult.ok) {
    return {
      ok: false,
      errors: [parsedResult.error],
      warnings: [],
      marketResearch: null,
      extractedFrom: ""
    };
  }

  const validation = validateMarketResearchPayload(parsedResult.value);
  if (validation.errors.length > 0) {
    return {
      ok: false,
      errors: validation.errors,
      warnings: validation.warnings,
      marketResearch: null,
      extractedFrom: parsedResult.extractedFrom
    };
  }

  const normalizedResearch = mergeWithDefaultMarketResearch(parsedResult.value);
  const itemWarnings = createMarketResearchItemWarnings(item, normalizedResearch);

  return {
    ok: true,
    errors: [],
    warnings: [...new Set([...validation.warnings, ...itemWarnings])],
    marketResearch: normalizedResearch,
    extractedFrom: parsedResult.extractedFrom
  };
}

function saveMarketResearchToItem(itemId, marketResearch) {
  const importedAt = new Date().toISOString();
  const storedResearch = {
    ...mergeWithDefaultMarketResearch(marketResearch),
    importedAt,
    importSource: MARKET_RESEARCH_MANUAL_IMPORT_SOURCE
  };
  let itemFound = false;

  items = items.map((item) => {
    if (item.id !== itemId) return item;
    itemFound = true;
    return {
      ...item,
      marketResearchHistory: [
        ...normalizeMarketResearchHistory(item.marketResearchHistory),
        storedResearch
      ],
      updatedAt: importedAt
    };
  });

  if (!itemFound) {
    return { ok: false, research: null };
  }

  saveItems();
  renderAll();
  return { ok: true, research: storedResearch };
}

function getLatestMarketResearch(item) {
  const history = normalizeMarketResearchHistory(item && item.marketResearchHistory);
  return history.length > 0 ? history[history.length - 1] : null;
}

function getLatestMarketResearchPair(item) {
  const history = normalizeMarketResearchHistory(item && item.marketResearchHistory);
  if (history.length < 2) return null;

  return {
    previous: history[history.length - 2],
    latest: history[history.length - 1]
  };
}

function isComparableMarketResearchPrice(value) {
  return typeof value === "number" && Number.isFinite(value);
}

function createPriceDiff(label, previousValue, latestValue) {
  const hasPrevious = isComparableMarketResearchPrice(previousValue);
  const hasLatest = isComparableMarketResearchPrice(latestValue);
  const difference = hasPrevious && hasLatest ? latestValue - previousValue : null;
  const changeRate = difference !== null && previousValue > 0
    ? (difference / previousValue) * 100
    : null;
  const direction = difference === null
    ? "unavailable"
    : difference > 0
      ? "up"
      : difference < 0
        ? "down"
        : "flat";
  let changeText = "比較不可";

  if (hasPrevious && hasLatest) {
    const differenceText = difference === 0
      ? "変化なし"
      : `${difference > 0 ? "+" : ""}${formatYen(difference)}`;
    changeText = `${formatYen(previousValue)} → ${formatYen(latestValue)}（${differenceText}）`;
  } else if (hasPrevious) {
    changeText = `${formatYen(previousValue)} → 今回なし`;
  } else if (hasLatest) {
    changeText = `前回なし → ${formatYen(latestValue)}`;
  }

  return {
    label,
    previousValue: hasPrevious ? previousValue : null,
    latestValue: hasLatest ? latestValue : null,
    difference,
    changeRate,
    direction,
    displayText: changeText
  };
}

function normalizeMarketResearchDiffStatus(value) {
  return typeof value === "string"
    ? value.trim().toLocaleLowerCase("en-US").replace(/[\s-]+/g, "_")
    : "";
}

function createStatusDiff(label, previousValue, latestValue, fieldName = "") {
  const previousRaw = typeof previousValue === "string" && previousValue.trim()
    ? previousValue.trim()
    : "unknown";
  const latestRaw = typeof latestValue === "string" && latestValue.trim()
    ? latestValue.trim()
    : "unknown";

  return {
    label,
    fieldName,
    previousValue: previousRaw,
    latestValue: latestRaw,
    previousNormalized: normalizeMarketResearchDiffStatus(previousRaw),
    latestNormalized: normalizeMarketResearchDiffStatus(latestRaw),
    changed: normalizeMarketResearchDiffStatus(previousRaw) !== normalizeMarketResearchDiffStatus(latestRaw),
    displayText: `${formatMarketResearchDisplayValue(fieldName, previousRaw)} → ${formatMarketResearchDisplayValue(fieldName, latestRaw)}`
  };
}

function getMarketResearchComparisonDate(marketResearch) {
  const value = marketResearch.researchMeta.researchedAt || marketResearch.importedAt;
  if (!value) return "不明";

  const datePrefix = String(value).match(/^\d{4}-\d{2}-\d{2}/);
  return datePrefix ? datePrefix[0] : String(value);
}

function getMarketResearchConditionSeverity(fieldName, value) {
  const normalizedValue = normalizeMarketResearchDiffStatus(value);
  const severityMaps = {
    stockStatus: {
      available: 0, in_stock: 0, stocked: 0, normal: 0,
      preorder: 1, pre_order: 1, backorder: 1,
      low_stock: 2, limited_stock: 2,
      out_of_stock: 3, sold_out: 3, discontinued: 4
    },
    availability: {
      available: 0, in_stock: 0, normal: 0,
      limited: 2, scarce: 2, out_of_stock: 3, sold_out: 3, unavailable: 3
    },
    supplyStatus: {
      normal: 0, regular: 0, stable: 0, regular_sale: 0,
      limited: 1, low: 2, tight: 2, scarce: 2, unstable: 2, discontinued: 3
    },
    soldOutRisk: {
      none: 0, low: 1, medium: 2, high: 3, very_high: 4, critical: 4
    }
  };
  return Object.prototype.hasOwnProperty.call(severityMaps[fieldName] || {}, normalizedValue)
    ? severityMaps[fieldName][normalizedValue]
    : null;
}

function hasMarketResearchAvailabilityWorsened(statusDiffs) {
  return statusDiffs.some((entry) => {
    if (!['stockStatus', 'availability', 'supplyStatus', 'soldOutRisk'].includes(entry.fieldName)) {
      return false;
    }
    const previousSeverity = getMarketResearchConditionSeverity(entry.fieldName, entry.previousValue);
    const latestSeverity = getMarketResearchConditionSeverity(entry.fieldName, entry.latestValue);
    return previousSeverity !== null && latestSeverity !== null && latestSeverity > previousSeverity;
  });
}

function createMarketResearchDiffAdvice(diff) {
  const typicalPriceDiff = diff.priceDiffs.find((entry) => entry.key === "marketPriceTypical");
  const latestMinimumPrice = diff.latest.priceSummary.marketPriceMin;
  const latestNextCheckPrice = diff.latest.purchaseTiming.nextCheckPrice;
  const reachedNextCheckPrice = isComparableMarketResearchPrice(latestMinimumPrice)
    && isComparableMarketResearchPrice(latestNextCheckPrice)
    && latestMinimumPrice <= latestNextCheckPrice;

  if (diff.availabilityWorsened) {
    return "在庫まわりの条件が前回より悪くなっているニャ。価格だけでなく、売り切れリスクや供給状況も一緒に確認した方がよさそうだニャ。";
  }

  if (typicalPriceDiff && typicalPriceDiff.changeRate !== null && typicalPriceDiff.changeRate >= 10) {
    return "相場中心価格は前回より大きく上がっているニャ。焦って結論を出さず、価格と在庫を早めに再確認するのがよさそうだニャ。";
  }

  if (typicalPriceDiff && typicalPriceDiff.changeRate !== null && typicalPriceDiff.changeRate <= -10) {
    return "相場中心価格は前回より大きく下がっているニャ。在庫も悪化していなければ、条件を見比べる材料が増えたと考えられるニャ。";
  }

  if (reachedNextCheckPrice) {
    return "最安価格が次回確認価格以下になっているニャ。送料・状態・販売元を確認して、条件の良い出品か見てみる価値はありそうだニャ。";
  }

  if (typicalPriceDiff && typicalPriceDiff.changeRate !== null && Math.abs(typicalPriceDiff.changeRate) < 3) {
    return "相場中心価格は前回から大きく動いていないニャ。在庫状況も大きく変わっていなければ、もう少し様子を見る材料になるニャ。";
  }

  if (typicalPriceDiff && typicalPriceDiff.changeRate !== null && typicalPriceDiff.changeRate >= 3) {
    return "相場中心価格は前回より上がっているニャ。価格変化が続くか、在庫とあわせて次回も確認するとよさそうだニャ。";
  }

  if (typicalPriceDiff && typicalPriceDiff.changeRate !== null && typicalPriceDiff.changeRate <= -3) {
    return "相場中心価格は前回より下がっているニャ。在庫が大きく悪化していなければ、次の価格確認も有効だニャ。";
  }

  return "比較できる価格情報がまだ少ないニャ。次回も同じ項目を確認すると、相場の動きが読み取りやすくなるニャ。";
}

function createMarketResearchDiff(previous, latest) {
  const normalizedPrevious = mergeWithDefaultMarketResearch(previous);
  const normalizedLatest = mergeWithDefaultMarketResearch(latest);
  const priceDiffs = [
    { key: "marketPriceTypical", label: "相場中心", previous: normalizedPrevious.priceSummary.marketPriceTypical, latest: normalizedLatest.priceSummary.marketPriceTypical },
    { key: "marketPriceMin", label: "最安価格", previous: normalizedPrevious.priceSummary.marketPriceMin, latest: normalizedLatest.priceSummary.marketPriceMin },
    { key: "marketPriceMax", label: "最高価格", previous: normalizedPrevious.priceSummary.marketPriceMax, latest: normalizedLatest.priceSummary.marketPriceMax },
    { key: "officialPrice", label: "公式価格", previous: normalizedPrevious.priceSummary.officialPrice, latest: normalizedLatest.priceSummary.officialPrice },
    { key: "nextCheckPrice", label: "次回確認価格", previous: normalizedPrevious.purchaseTiming.nextCheckPrice, latest: normalizedLatest.purchaseTiming.nextCheckPrice }
  ].map((entry) => ({
    key: entry.key,
    ...createPriceDiff(entry.label, entry.previous, entry.latest)
  }));
  const availabilityDiffs = [
    ["在庫状況", "stockStatus", normalizedPrevious.availabilitySummary.stockStatus, normalizedLatest.availabilitySummary.stockStatus],
    ["販売状況", "availability", normalizedPrevious.availabilitySummary.availability, normalizedLatest.availabilitySummary.availability],
    ["供給状況", "supplyStatus", normalizedPrevious.availabilitySummary.supplyStatus, normalizedLatest.availabilitySummary.supplyStatus],
    ["売り切れリスク", "soldOutRisk", normalizedPrevious.availabilitySummary.soldOutRisk, normalizedLatest.availabilitySummary.soldOutRisk],
    ["販売区分", "limitedOrRegular", normalizedPrevious.availabilitySummary.limitedOrRegular, normalizedLatest.availabilitySummary.limitedOrRegular]
  ].map(([label, fieldName, previousValue, latestValue]) => (
    createStatusDiff(label, previousValue, latestValue, fieldName)
  ));
  const signalDiffs = [
    ["価格傾向", "priceTrend", normalizedPrevious.marketSignals.priceTrend, normalizedLatest.marketSignals.priceTrend],
    ["転売圧", "resalePressure", normalizedPrevious.marketSignals.resalePressure, normalizedLatest.marketSignals.resalePressure],
    ["需要感", "demandSignal", normalizedPrevious.marketSignals.demandSignal, normalizedLatest.marketSignals.demandSignal],
    ["価格変動", "volatility", normalizedPrevious.marketSignals.volatility, normalizedLatest.marketSignals.volatility],
    ["セール期待", "saleLikelihood", normalizedPrevious.marketSignals.saleLikelihood, normalizedLatest.marketSignals.saleLikelihood]
  ].map(([label, fieldName, previousValue, latestValue]) => (
    createStatusDiff(label, previousValue, latestValue, fieldName)
  ));
  const diff = {
    previous: normalizedPrevious,
    latest: normalizedLatest,
    previousDate: getMarketResearchComparisonDate(normalizedPrevious),
    latestDate: getMarketResearchComparisonDate(normalizedLatest),
    priceDiffs,
    availabilityDiffs,
    signalDiffs,
    statusDiffs: [...availabilityDiffs, ...signalDiffs]
  };
  diff.availabilityWorsened = hasMarketResearchAvailabilityWorsened(diff.availabilityDiffs);
  diff.advice = createMarketResearchDiffAdvice(diff);
  return diff;
}

function renderMarketResearchDiffRows(rows) {
  return rows.map((entry) => `
    <li>
      <span>${escapeHtml(entry.label)}</span>
      <strong>${escapeHtml(entry.displayText)}</strong>
    </li>
  `).join("");
}

function renderMarketResearchDiff(item) {
  const pair = getLatestMarketResearchPair(item);
  if (!pair) return "";

  const diff = createMarketResearchDiff(pair.previous, pair.latest);
  return `
    <details class="market-research-diff-box">
      <summary>前回調査からの変化</summary>
      <div class="market-research-diff-content">
        <dl class="market-research-diff-dates">
          <div><dt>前回</dt><dd>${escapeHtml(diff.previousDate)}</dd></div>
          <div><dt>今回</dt><dd>${escapeHtml(diff.latestDate)}</dd></div>
        </dl>
        <section>
          <h4>価格の変化</h4>
          <ul>${renderMarketResearchDiffRows(diff.priceDiffs)}</ul>
        </section>
        <section>
          <h4>市場状況の変化</h4>
          <ul>${renderMarketResearchDiffRows(diff.availabilityDiffs)}</ul>
        </section>
        <section>
          <h4>市場シグナルの変化</h4>
          <ul>${renderMarketResearchDiffRows(diff.signalDiffs)}</ul>
        </section>
        <aside class="market-research-diff-advice">
          <strong>執事猫コメント</strong>
          <p>${escapeHtml(diff.advice)}</p>
        </aside>
      </div>
    </details>
  `;
}

function formatMarketResearchPrice(value) {
  return typeof value === "number" && Number.isFinite(value) ? formatYen(value) : "未確認";
}

const MARKET_RESEARCH_DISPLAY_LABELS = {
  stockStatus: {
    unknown: "未確認",
    available: "在庫あり",
    in_stock: "在庫あり",
    stocked: "在庫あり",
    low_stock: "残りわずか",
    limited_stock: "在庫少なめ",
    out_of_stock: "在庫なし",
    sold_out: "売り切れ",
    backorder: "取り寄せ",
    preorder: "予約受付中",
    pre_order: "予約受付中",
    discontinued: "販売終了",
    mixed: "店舗により異なる"
  },
  supplyStatus: {
    unknown: "未確認",
    normal: "通常流通",
    regular: "通常流通",
    regular_sale: "通常販売",
    stable: "安定供給",
    limited: "限定流通",
    tight: "品薄",
    low: "供給少なめ",
    scarce: "品薄",
    unstable: "供給不安定",
    discontinued: "供給終了",
    mixed: "販売先により異なる"
  },
  availability: {
    unknown: "未確認",
    widely_available: "広く流通",
    available: "販売あり",
    in_stock: "販売あり",
    normal: "通常販売",
    limited: "限定流通",
    scarce: "入手困難",
    out_of_stock: "在庫なし",
    sold_out: "売り切れ",
    unavailable: "販売なし",
    preorder: "予約受付中",
    pre_order: "予約受付中",
    discontinued: "販売終了",
    mixed: "販売先により異なる"
  },
  soldOutRisk: {
    unknown: "未確認",
    none: "なし",
    low: "低",
    medium: "中",
    high: "高",
    very_high: "非常に高い",
    critical: "非常に高い"
  },
  limitedOrRegular: {
    unknown: "未確認",
    regular: "通常商品",
    limited: "限定商品",
    mixed: "販売形態混在"
  },
  priceTrend: {
    unknown: "未確認",
    stable: "横ばい",
    rising: "上昇傾向",
    up: "上昇傾向",
    upward: "上昇傾向",
    falling: "下落傾向",
    down: "下落傾向",
    downward: "下落傾向",
    volatile: "変動が大きい",
    premium: "高騰傾向",
    mixed: "販売先により異なる"
  },
  resalePressure: {
    unknown: "未確認",
    none: "なし",
    low: "低",
    medium: "中",
    high: "高",
    very_high: "非常に高い"
  },
  demandSignal: {
    unknown: "未確認",
    none: "なし",
    low: "低",
    normal: "通常",
    medium: "中",
    high: "高",
    very_high: "非常に高い"
  },
  volatility: {
    unknown: "未確認",
    low: "低",
    medium: "中",
    high: "高",
    stable: "安定",
    volatile: "変動が大きい"
  },
  saleLikelihood: {
    unknown: "未確認",
    none: "なし",
    low: "低",
    medium: "中",
    high: "高",
    very_high: "非常に高い"
  },
  confidence: {
    unknown: "未確認",
    low: "低",
    medium: "中",
    high: "高",
    very_high: "非常に高い"
  }
};

function formatMarketResearchDisplayValue(fieldName, value) {
  const rawValue = typeof value === "string" ? value.trim() : "";
  if (!rawValue) return "未確認";

  const normalizedValue = rawValue
    .toLocaleLowerCase("en-US")
    .replace(/[\s-]+/g, "_");
  const knownLabel = MARKET_RESEARCH_DISPLAY_LABELS[fieldName]?.[normalizedValue];
  if (knownLabel) return knownLabel;

  if (fieldName === "priceTrend") {
    const officialAndSecondaryMatch = normalizedValue.match(
      /^official_price_around_(\d+)_secondary_market_below_official$/
    );
    if (officialAndSecondaryMatch) {
      return `公式価格付近（${formatYen(Number(officialAndSecondaryMatch[1]))}）・二次流通は公式価格以下`;
    }
  }

  if (/[^\x00-\x7F]/.test(rawValue)) {
    return rawValue;
  }

  return "個別記述";
}

function getMarketResearchDisplayDate(marketResearch) {
  const dateValue = marketResearch.researchMeta.researchedAt || marketResearch.importedAt;
  return dateValue ? formatDisplayDate(dateValue) : "日付未設定";
}

function getMarketResearchCardHtml(item) {
  const history = normalizeMarketResearchHistory(item.marketResearchHistory);
  if (history.length === 0) return "";

  const latest = history[history.length - 1];
  const priceSummary = latest.priceSummary;
  const availability = latest.availabilitySummary;
  const signals = latest.marketSignals;
  const historyRows = history
    .slice()
    .reverse()
    .slice(0, 5)
    .map((entry) => `
      <li>
        <span>${escapeHtml(getMarketResearchDisplayDate(entry))}</span>
        <strong>${escapeHtml(formatMarketResearchPrice(entry.priceSummary.marketPriceTypical))}</strong>
        <small>${escapeHtml(formatMarketResearchDisplayValue("stockStatus", entry.availabilitySummary.stockStatus))} / ${escapeHtml(formatMarketResearchDisplayValue("priceTrend", entry.marketSignals.priceTrend))}</small>
      </li>
    `)
    .join("");

  return `
    <section class="market-research-card-summary" aria-label="最新のAI相場調査">
      <div class="market-research-card-heading">
        <span>AI相場調査</span>
        <strong>${escapeHtml(getMarketResearchDisplayDate(latest))}</strong>
      </div>
      <div class="market-research-card-grid">
        <div><span>相場中心</span><strong>${escapeHtml(formatMarketResearchPrice(priceSummary.marketPriceTypical))}</strong></div>
        <div><span>価格帯</span><strong>${escapeHtml(`${formatMarketResearchPrice(priceSummary.marketPriceMin)} 〜 ${formatMarketResearchPrice(priceSummary.marketPriceMax)}`)}</strong></div>
        <div><span>在庫</span><strong>${escapeHtml(formatMarketResearchDisplayValue("stockStatus", availability.stockStatus))}</strong></div>
        <div><span>傾向</span><strong>${escapeHtml(formatMarketResearchDisplayValue("priceTrend", signals.priceTrend))}</strong></div>
      </div>
      ${latest.summaries.marketSummary ? `<p>${escapeHtml(latest.summaries.marketSummary)}</p>` : ""}
      ${renderMarketResearchDiff(item)}
      <details class="market-research-history-box">
        <summary>相場調査履歴 ${history.length}件</summary>
        <ul>${historyRows}</ul>
      </details>
    </section>
  `;
}

function getMarketResearchPromptSchemaTemplate() {
  const template = createDefaultMarketResearch();
  template.sources = [createDefaultMarketResearchSource()];
  return JSON.stringify(template, null, 2);
}

// ==============================
// AI相場偵察（表示専用）
// ==============================
// 商品情報から価格調査プロンプトを組み立ててクリップボードにコピーし、
// ChatGPTを新規タブで開く。保存データ・判定・履歴には一切影響しない。

const AI_ASSIST_CONFIG = {
  // 将来ChatGPT以外に差し替え可能にするための定数（shop configと同じ流儀）
  chatUrl: "https://chatgpt.com/"
};

// テキスト任意項目：空なら（未登録）
function promptText(value) {
  return (value && String(value).trim()) ? String(value).trim() : "（未登録）";
}

// 価格：0以下なら「未設定」、正なら「7,980円」形式（"円" は戻り値に含む）
function promptPrice(value) {
  const number = toNumber(value);
  return number > 0 ? `${number.toLocaleString("ja-JP")}円` : "未設定";
}

function buildMarketResearchPrompt(item, options = {}) {
  const memoText = options.includeMemo === false
    ? "（この依頼では共有しない）"
    : promptText(item.memo);

  return `あなたは、コレクター向け商品の市場価格を調査するアシスタントです。

以下の商品について、現在の相場、在庫状況、安く買える候補、価格を見るうえでの注意点を調べて整理してください。

この依頼は、購入判断ではなく、価格・在庫・入手性の調査です。
趣味としての価値判断や、買うべきかどうかの結論は不要です。

# 調査対象

商品名：
${promptText(item.name)}

メーカー・ブランド：
${promptText(item.maker)}

型番・品番・セット番号：
${promptText(item.modelNumber)}

カテゴリ：
${promptText(item.category)}

販売状態メモ：
${item.itemType}

商品URL：
${promptText(item.productUrl)}

発売日・発売予定日：
${promptText(item.releaseDate)}

メモ：
${memoText}

# アプリに登録している価格情報

価格基準：
${item.priceBasisType}

定価・基準価格：
${promptPrice(item.listPrice)}

登録時価格：
${promptPrice(item.registeredPrice)}

現在検討中の価格：
${promptPrice(item.currentPrice)}

目標価格：
${promptPrice(item.targetPrice)}

許容上限価格：
${promptPrice(item.maxAcceptablePrice)}

# 調査条件

* まず、商品名・メーカー・型番・商品URLから、調査対象の商品をできるだけ正確に特定してください。
* 日本国内から購入できる店舗・サイトを優先してください。
* 新品、中古、フリマ、オークションで価格差がある場合は分けてください。
* 送料、税込価格、ポイント還元、在庫状況が分かる場合は区別してください。
* 売り切れ価格、過去の落札価格、現在販売中の価格は混同しないでください。
* 型番違い、色違い、サイズ違い、再販版、限定版、並行輸入品、付属品欠品、箱傷み、偽物・類似品の可能性があれば注意点に入れてください。
* 商品URLの価格だけで判断せず、他の販売候補も比較してください。
* 情報が確認できない場合は、推測で断定せず「確認できない」と書いてください。

# 回答形式

## 市場調査サマリー

調査日：
対象商品の特定精度：
新品相場：
中古相場：
フリマ・オークション相場：
最安候補：
送料込み最安候補：
現在検討中の価格の位置づけ：
価格傾向：

## 価格候補一覧

| 区分 | 店舗・サイト | 商品状態 | 価格 | 送料 | 送料込み目安 | 在庫状況 | URL | 注意点 |
| -- | ------ | ---- | -: | -: | -----: | ---- | --- | --- |

## 現在価格との比較

現在検討中の価格：
目標価格：
許容上限価格：

相場より安いと見られる価格帯：
相場並みと見られる価格帯：
相場より高いと見られる価格帯：

## 見落とし注意ポイント

* 型番・品番違い：
* 新品と中古の差：
* 付属品・箱・保証：
* 送料・手数料：
* 在庫・再販可能性：
* フリマ・オークションで見るべき点：
* その他：

## 価格調査としての要点

購入判断ではなく、価格調査として重要な点だけを箇条書きでまとめてください。

# アプリ取り込み用JSON

回答の最後に、アプリ取り込み用JSONを1つだけ出力してください。

条件：
* JSONコードブロック内に出力する
* キー名は指定スキーマから変更しない
* 確認できない値は推測せず null または "unknown" とする
* 価格はカンマや通貨記号を含めず数値で出力する
* 日付は YYYY-MM-DD 形式にする
* URLは実際に確認したページのみ記載する
* 購入推奨、見送り推奨、趣味的価値判断は含めない
* 市場情報、在庫状況、価格傾向、注意点、情報源を中心に整理する

以下のJSONスキーマを使ってください：

${getMarketResearchPromptSchemaTemplate()}`;
}

function replaceMarketResearchPromptMemo(prompt, memoText) {
  const memoStartMarker = "\nメモ：\n";
  const memoEndMarker = "\n\n# アプリに登録している価格情報";
  const memoStartIndex = prompt.indexOf(memoStartMarker);
  const memoEndIndex = prompt.indexOf(memoEndMarker, memoStartIndex + memoStartMarker.length);

  if (memoStartIndex < 0 || memoEndIndex < 0) {
    return null;
  }

  return `${prompt.slice(0, memoStartIndex + memoStartMarker.length)}${memoText}${prompt.slice(memoEndIndex)}`;
}

function copyTextToClipboard(text) {
  let copiedSynchronously = false;
  let temporaryTextarea = null;
  let textareaAppended = false;
  try {
    temporaryTextarea = document.createElement("textarea");
    temporaryTextarea.value = text;
    temporaryTextarea.setAttribute("readonly", "");
    temporaryTextarea.style.position = "absolute";
    temporaryTextarea.style.left = "-9999px";
    document.body.appendChild(temporaryTextarea);
    textareaAppended = true;
    temporaryTextarea.select();
    temporaryTextarea.setSelectionRange(0, text.length); // iOS必須
    copiedSynchronously = document.execCommand("copy");
  } catch (error) {
    copiedSynchronously = false;
  } finally {
    if (textareaAppended) {
      try {
        document.body.removeChild(temporaryTextarea);
      } catch (error) {
        // DOM側ですでに除去済みでもコピー結果の判定は継続する。
      }
    }
  }

  if (copiedSynchronously) {
    return Promise.resolve(true);
  }

  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text)
      .then(() => true)
      .catch(() => false);
  }

  return Promise.resolve(false);
}

// ボタン押下ではまず確認モーダルを出す。コピー開始と新規タブ表示は
// モーダル内ボタンのユーザージェスチャー中に実行し、コピー結果だけを非同期で確認する。
// 依頼書は送信前に編集でき、メモを含めない選択もできる。
function handleAiResearch(itemId) {
  const item = items.find((target) => target.id === itemId);
  if (!item) return;

  showAiResearchConfirm(item, { source: "saved-item" });
}

function showAiResearchConfirm(item, options = {}) {
  const isDraftForm = options.source === "draft-form";
  const dialogId = "aiResearchConfirmDialog";
  const previouslyFocusedElement = document.activeElement;
  const existingDialog = document.querySelector(`#${dialogId}`);
  if (existingDialog) {
    existingDialog.remove();
  }

  const dialog = document.createElement("div");
  dialog.id = dialogId;
  dialog.className = "dialog-backdrop";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", `${dialogId}Title`);
  const noteHtml = isDraftForm
    ? `
        <p>Q1の商品情報から、ChatGPTへ渡す調査依頼書を作ったニャ。</p>
        <ul>
          <li>まだ商品は保存されていないニャ。依頼書をコピーしても、商品登録や相場履歴の保存は行わないニャ。</li>
          <li>アプリが自動送信することはないニャ。開いたChatGPTへ<strong>ご主人が貼り付けて送信</strong>する仕組みニャ。</li>
          <li>回答末尾のJSONをQ2へ戻すと、市場情報と価格情報を下書きにできるニャ。</li>
        </ul>
        <p class="ai-research-note-sub">欲しい度・目標価格・許容上限・メモなど、ご主人の判断項目はAIに埋めさせないニャ。</p>
      `
    : `
        <p>この画面では、ChatGPTへ渡す前の調査依頼書を確認・編集できるニャ。</p>
        <ul>
          <li>アプリが自動送信することはないニャ。依頼書をコピーしたあと、開いたChatGPTへ<strong>ご主人が貼り付けて送信</strong>する仕組みニャ。</li>
          <li>初期状態では<strong>メモの内容も含まれる</strong>ニャ。共有したくない場合は、下のチェックを外すか依頼書を編集するニャ。</li>
          <li>「コピーしてChatGPTを開く」では、依頼書をコピーしてからChatGPT（chatgpt.com）を新しいタブで開くニャ。</li>
        </ul>
        <p class="ai-research-note-sub">買うかどうかの判断は依頼しないニャ。相場・在庫・最安の偵察だけニャ。判断は評議会の仕事ニャ。</p>
      `;
  dialog.innerHTML = `
    <section class="mode-dialog ai-research-dialog">
      <div class="section-title">
        <div>
          <p class="panel-eyebrow">SCOUT REQUEST</p>
          <h2 id="${dialogId}Title">🐱 AIに相場を偵察させるニャ</h2>
        </div>
      </div>
      <div class="ai-research-note">
        ${noteHtml}
      </div>
      <label class="ai-research-memo-option${isDraftForm ? " hidden" : ""}">
        <input type="checkbox" id="${dialogId}IncludeMemo" checked>
        <span>商品メモを依頼書に含める</span>
      </label>
      <label class="ai-research-preview-label" for="${dialogId}Preview">調査依頼書（送信前に編集できます）</label>
      <textarea class="ai-research-preview" id="${dialogId}Preview" rows="10" spellcheck="false"></textarea>
      <div class="form-actions">
        <button type="button" class="primary-button" id="${dialogId}ProceedButton">コピーしてChatGPTを開く</button>
        <button type="button" class="secondary-button" id="${dialogId}CopyButton">依頼書だけコピー</button>
        <button type="button" class="secondary-button" id="${dialogId}CancelButton">やめておく</button>
      </div>
    </section>
  `;

  const preview = dialog.querySelector(`#${dialogId}Preview`);
  const includeMemoInput = dialog.querySelector(`#${dialogId}IncludeMemo`);
  const proceedButton = dialog.querySelector(`#${dialogId}ProceedButton`);
  const copyButton = dialog.querySelector(`#${dialogId}CopyButton`);
  let copyInProgress = false;

  includeMemoInput.checked = !isDraftForm;

  const initializePreview = () => {
    preview.value = buildMarketResearchPrompt(item, {
      includeMemo: includeMemoInput.checked
    });
  };

  const updatePreviewMemo = () => {
    const memoText = includeMemoInput.checked
      ? promptText(item.memo)
      : "（この依頼では共有しない）";
    const updatedPrompt = replaceMarketResearchPromptMemo(preview.value, memoText);

    if (updatedPrompt === null) {
      includeMemoInput.checked = !includeMemoInput.checked;
      showAiToast("依頼書のメモ欄を見つけられなかったニャ。内容を直接編集してほしいニャ。");
      return;
    }

    preview.value = updatedPrompt;
  };

  const closeDialog = () => {
    dialog.remove();
    if (previouslyFocusedElement && previouslyFocusedElement.isConnected) {
      previouslyFocusedElement.focus();
    }
  };

  const copyPreviewText = async ({ openChat }) => {
    if (copyInProgress) return;
    copyInProgress = true;
    proceedButton.disabled = true;
    copyButton.disabled = true;

    const text = preview.value;
    const copyPromise = copyTextToClipboard(text);

    // 新規タブはユーザー操作中に開く。コピー結果はその後で確定する。
    if (openChat) {
      window.open(AI_ASSIST_CONFIG.chatUrl, "_blank", "noopener");
    }

    const copied = await copyPromise;
    if (copied) {
      closeDialog();
      showAiToast(openChat
        ? "調査依頼書をコピーしたニャ！ChatGPTに貼り付けて送るのニャ。"
        : "調査依頼書をコピーしたニャ！使いたい場所に貼り付けるのニャ。");
      return;
    }

    preview.focus();
    preview.select();
    copyInProgress = false;
    proceedButton.disabled = false;
    copyButton.disabled = false;
    showAiToast("自動コピーできなかったニャ。選択された依頼書を長押ししてコピーしてニャ。");
  };

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeDialog();
    }
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }

    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button, input, textarea"))
      .filter((element) => !element.disabled);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  includeMemoInput.addEventListener("change", updatePreviewMemo);
  dialog.querySelector(`#${dialogId}CancelButton`).addEventListener("click", closeDialog);
  copyButton.addEventListener("click", () => copyPreviewText({ openChat: false }));
  proceedButton.addEventListener("click", () => copyPreviewText({ openChat: true }));

  document.body.appendChild(dialog);
  initializePreview();
  proceedButton.focus();
}

let aiToastTimer = null;

function showAiToast(message) {
  let toast = document.querySelector("#aiToast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "aiToast";
    toast.className = "ai-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.textContent = message;
  toast.classList.add("visible");

  if (aiToastTimer) {
    clearTimeout(aiToastTimer);
  }
  aiToastTimer = setTimeout(() => {
    toast.classList.remove("visible");
  }, 4000);
}

function renderMarketResearchMessageList(container, messages) {
  container.textContent = "";
  if (!Array.isArray(messages) || messages.length === 0) {
    container.hidden = true;
    return;
  }

  const list = document.createElement("ul");
  messages.forEach((message) => {
    const listItem = document.createElement("li");
    listItem.textContent = message;
    list.appendChild(listItem);
  });
  container.appendChild(list);
  container.hidden = false;
}

function setMarketResearchPreviewText(dialog, fieldName, value) {
  const target = dialog.querySelector(`[data-market-preview="${fieldName}"]`);
  if (target) {
    target.textContent = value || "未確認";
  }
}

function renderMarketResearchImportPreview(dialog, preparedResult) {
  const marketResearch = preparedResult.marketResearch;
  const priceSummary = marketResearch.priceSummary;
  const availability = marketResearch.availabilitySummary;
  const priceRange = `${formatMarketResearchPrice(priceSummary.marketPriceMin)} 〜 ${formatMarketResearchPrice(priceSummary.marketPriceMax)}`;

  setMarketResearchPreviewText(dialog, "researchedAt", marketResearch.researchMeta.researchedAt || "未設定");
  setMarketResearchPreviewText(dialog, "productName", marketResearch.target.productName);
  setMarketResearchPreviewText(dialog, "maker", marketResearch.target.maker || marketResearch.target.brand);
  setMarketResearchPreviewText(dialog, "modelNumber", marketResearch.target.modelNumber);
  setMarketResearchPreviewText(dialog, "referencePrice", formatMarketResearchPrice(marketResearch.target.referencePrice));
  setMarketResearchPreviewText(dialog, "marketPriceTypical", formatMarketResearchPrice(priceSummary.marketPriceTypical));
  setMarketResearchPreviewText(dialog, "priceRange", priceRange);
  setMarketResearchPreviewText(dialog, "stockStatus", formatMarketResearchDisplayValue("stockStatus", availability.stockStatus));
  setMarketResearchPreviewText(dialog, "supplyStatus", formatMarketResearchDisplayValue("supplyStatus", availability.supplyStatus));
  setMarketResearchPreviewText(dialog, "priceTrend", formatMarketResearchDisplayValue("priceTrend", marketResearch.marketSignals.priceTrend));
  setMarketResearchPreviewText(dialog, "confidence", formatMarketResearchDisplayValue("confidence", marketResearch.researchMeta.confidence));
  setMarketResearchPreviewText(dialog, "sourceCount", `${marketResearch.sources.length}件`);
  setMarketResearchPreviewText(dialog, "marketSummary", marketResearch.summaries.marketSummary);

  const cautionsList = dialog.querySelector("[data-market-preview-cautions]");
  cautionsList.textContent = "";
  const cautionTexts = [
    ...marketResearch.cautions,
    marketResearch.summaries.cautionComment
  ].filter((entry) => typeof entry === "string" && entry.trim());
  if (cautionTexts.length === 0) {
    const listItem = document.createElement("li");
    listItem.textContent = "記載なし";
    cautionsList.appendChild(listItem);
  } else {
    cautionTexts.forEach((caution) => {
      const listItem = document.createElement("li");
      listItem.textContent = caution;
      cautionsList.appendChild(listItem);
    });
  }

  const sourcesList = dialog.querySelector("[data-market-preview-sources]");
  sourcesList.textContent = "";
  if (marketResearch.sources.length === 0) {
    const listItem = document.createElement("li");
    listItem.textContent = "情報源なし";
    sourcesList.appendChild(listItem);
  } else {
    marketResearch.sources.forEach((source, index) => {
      const listItem = document.createElement("li");
      const name = source.name || `情報源 ${index + 1}`;
      const price = formatMarketResearchPrice(source.price);
      const url = source.url ? ` / ${source.url}` : "";
      const stockStatus = formatMarketResearchDisplayValue("stockStatus", source.stockStatus);
      listItem.textContent = `${name} / ${price} / ${stockStatus}${url}`;
      sourcesList.appendChild(listItem);
    });
  }

  renderMarketResearchMessageList(
    dialog.querySelector("[data-market-import-warnings]"),
    preparedResult.warnings
  );
}

// ==============================
// 新規商品フォーム用 AI相場下書き
// ==============================

function createDraftItemFromFormForAiResearch() {
  return {
    id: "draft-form",
    name: document.querySelector("#nameInput").value.trim(),
    category: document.querySelector("#categoryInput").value.trim(),
    maker: document.querySelector("#makerInput").value.trim(),
    modelNumber: document.querySelector("#modelNumberInput").value.trim(),
    productUrl: document.querySelector("#productUrlInput").value.trim(),
    itemType: document.querySelector("#itemTypeInput").value || "不明",
    releaseDate: document.querySelector("#releaseDateInput").value || "",
    priceBasisType: document.querySelector("#priceBasisTypeInput").value || DEFAULT_PRICE_BASIS_TYPE,
    listPrice: toNumber(document.querySelector("#listPriceInput").value),
    registeredPrice: toNumber(document.querySelector("#registeredPriceInput").value),
    currentPrice: toNumber(document.querySelector("#registeredPriceInput").value),
    targetPrice: toNumber(document.querySelector("#targetPriceInput").value),
    maxAcceptablePrice: toNumber(document.querySelector("#maxAcceptablePriceInput").value),
    memo: "",
    marketResearchHistory: []
  };
}

function isEditingItemForm() {
  return Boolean(document.querySelector("#editingItemId").value);
}

function showDraftMarketResearchPanel() {
  if (isEditingItemForm()) {
    renderDraftMarketResearchUiState();
    showAiToast("既存商品の編集ではAI下書き作成は使わないニャ。商品カード側から相場調査を追加してニャ。");
    return false;
  }

  document.querySelector("#marketDraftAiPanel").classList.remove("hidden");
  return true;
}

function handleDraftAiResearch() {
  const draftItem = createDraftItemFromFormForAiResearch();
  if (!draftItem.name) {
    showAiToast("まずはQ1で商品名を教えてニャ。名前がないと、市場へ偵察に出られないニャ。");
    document.querySelector("#nameInput").focus();
    return;
  }

  if (!showDraftMarketResearchPanel()) return;
  showAiResearchConfirm(draftItem, { source: "draft-form" });
}

function prepareDraftMarketResearchImport(inputText) {
  return prepareMarketResearchImport(createDraftItemFromFormForAiResearch(), inputText);
}

function getPositiveMarketResearchPrice(value) {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

function getDraftListPriceFromMarketResearch(marketResearch) {
  const prices = [
    marketResearch.target.referencePrice,
    marketResearch.priceSummary.officialPrice,
    marketResearch.priceSummary.marketPriceTypical,
    marketResearch.priceSummary.usedPriceTypical
  ];
  return prices.map(getPositiveMarketResearchPrice).find((price) => price > 0) || 0;
}

function getDraftRegisteredPriceFromMarketResearch(marketResearch) {
  const typicalPrice = getPositiveMarketResearchPrice(marketResearch.priceSummary.marketPriceTypical);
  if (typicalPrice > 0) return typicalPrice;

  const usedTypicalPrice = getPositiveMarketResearchPrice(marketResearch.priceSummary.usedPriceTypical);
  if (usedTypicalPrice > 0) return usedTypicalPrice;

  const minimumPrice = getPositiveMarketResearchPrice(marketResearch.priceSummary.marketPriceMin);
  if (minimumPrice > 0) return minimumPrice;

  const sourcePrices = marketResearch.sources
    .map((source) => getPositiveMarketResearchPrice(source.price))
    .filter((price) => price > 0);
  return sourcePrices.length > 0 ? Math.min(...sourcePrices) : 0;
}

function getDraftPriceBasisTypeFromMarketResearch(marketResearch) {
  const referencePrice = getPositiveMarketResearchPrice(marketResearch.target.referencePrice);
  const officialPrice = getPositiveMarketResearchPrice(marketResearch.priceSummary.officialPrice);
  const marketTypical = getPositiveMarketResearchPrice(marketResearch.priceSummary.marketPriceTypical);
  const usedTypical = getPositiveMarketResearchPrice(marketResearch.priceSummary.usedPriceTypical);

  if (referencePrice > 0 || officialPrice > 0) return "定価を基準にする";
  if (usedTypical > 0 && marketTypical <= 0) return "中古相場を基準にする";
  if (marketTypical > 0) return "参考相場を基準にする";
  return UNKNOWN_PRICE_BASIS_TYPE;
}

function normalizeMarketResearchStatusValue(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/[\s-]+/g, "_");
}

function mapMarketResearchToItemType(marketResearch) {
  const statuses = [
    marketResearch.availabilitySummary.stockStatus,
    marketResearch.availabilitySummary.supplyStatus,
    marketResearch.availabilitySummary.availability
  ].map(normalizeMarketResearchStatusValue);
  const includesAny = (candidates) => candidates.some((candidate) => statuses.includes(candidate));

  if (includesAny(["discontinued", "ended"])) return "廃盤・終売";
  if (includesAny(["preorder", "pre_order"])) return "予約・発売前";
  if (includesAny(["low_stock", "limited_stock", "scarce", "out_of_stock", "sold_out"])) {
    return "品薄・売り切れ気味";
  }
  if (includesAny(["available", "in_stock", "stocked", "normal", "regular", "regular_sale"])) {
    return "通常販売中";
  }
  return "不明";
}

function setDraftFormTextValue(selector, value) {
  if (typeof value !== "string" || !value.trim()) return;
  document.querySelector(selector).value = value.trim();
}

function applyMarketResearchDraftToForm(marketResearch) {
  const target = marketResearch.target;
  setDraftFormTextValue("#nameInput", target.productName);
  setDraftFormTextValue("#categoryInput", target.category);
  setDraftFormTextValue("#makerInput", target.maker || target.brand);
  setDraftFormTextValue("#modelNumberInput", target.modelNumber);
  setDraftFormTextValue("#productUrlInput", target.productUrl);
  setDraftFormTextValue("#releaseDateInput", target.releaseDate);

  document.querySelector("#itemTypeInput").value = mapMarketResearchToItemType(marketResearch);
  document.querySelector("#priceBasisTypeInput").value = getDraftPriceBasisTypeFromMarketResearch(marketResearch);

  const listPrice = getDraftListPriceFromMarketResearch(marketResearch);
  const registeredPrice = getDraftRegisteredPriceFromMarketResearch(marketResearch);
  document.querySelector("#listPriceInput").value = listPrice > 0 ? String(listPrice) : "";
  document.querySelector("#registeredPriceInput").value = registeredPrice > 0 ? String(registeredPrice) : "";

  refreshItemFormAfterMarketDraftApplied();
}

function refreshItemFormAfterMarketDraftApplied() {
  updateCurrentPriceField();
  updatePriceBasisField();
  renderFormPriceStatus();
  updateLegoReleaseDateField();
}

function hideDraftMarketResearchPreview() {
  preparedDraftMarketResearch = null;
  document.querySelector("#draftMarketResearchPreview").classList.add("hidden");
  document.querySelector("#draftMarketResearchInput").focus();
}

function closeDraftMarketResearchPanel() {
  preparedDraftMarketResearch = null;
  document.querySelector("#draftMarketResearchPreview").classList.add("hidden");
  document.querySelector("#marketDraftAiPanel").classList.add("hidden");
}

function handleDraftMarketResearchReview() {
  if (!showDraftMarketResearchPanel()) return;

  const inputText = document.querySelector("#draftMarketResearchInput").value;
  const result = prepareDraftMarketResearchImport(inputText);
  renderMarketResearchMessageList(document.querySelector("#draftMarketResearchErrors"), result.errors);
  renderMarketResearchMessageList(
    document.querySelector("#draftMarketResearchParseWarnings"),
    result.ok ? [] : result.warnings
  );

  if (!result.ok) {
    preparedDraftMarketResearch = null;
    document.querySelector("#draftMarketResearchPreview").classList.add("hidden");
    document.querySelector("#draftMarketResearchInput").focus();
    return;
  }

  preparedDraftMarketResearch = result.marketResearch;
  const preview = document.querySelector("#draftMarketResearchPreview");
  renderMarketResearchImportPreview(preview, result);
  preview.classList.remove("hidden");
  const applyButton = document.querySelector("#draftMarketResearchApplyButton");
  applyButton.textContent = result.warnings.length > 0
    ? "警告を確認して下書きに反映する"
    : "フォームの下書きに反映する";
  applyButton.focus();
}

function applyPreparedDraftMarketResearch() {
  if (!preparedDraftMarketResearch || isEditingItemForm()) return;

  const confirmed = confirm(
    "AIの調査結果をフォームへ反映するニャ。\n\n" +
    "商品名・メーカー・型番・URL・販売状態・発売日・価格などの客観情報が上書きされる場合があるニャ。\n" +
    "欲しい度・目標価格・許容上限・メモなど、ご主人の判断項目は上書きしないニャ。\n\n" +
    "反映してよいかニャ？"
  );
  if (!confirmed) return;

  const importedAt = new Date().toISOString();
  const normalizedResearch = mergeWithDefaultMarketResearch(preparedDraftMarketResearch);
  applyMarketResearchDraftToForm(normalizedResearch);
  pendingDraftMarketResearch = {
    ...normalizedResearch,
    importedAt: normalizedResearch.importedAt || importedAt,
    importSource: normalizedResearch.importSource || MARKET_RESEARCH_MANUAL_IMPORT_SOURCE
  };
  preparedDraftMarketResearch = null;
  renderDraftMarketResearchUiState();
  showAiToast("市場の偵察結果を下書きに反映したニャ。次は内容を確認しながら進めるニャ。");
  setItemFormWizardStep(3);
}

function renderDraftMarketResearchUiState() {
  const choicePanel = document.querySelector("#marketDraftChoicePanel");
  const aiPanel = document.querySelector("#marketDraftAiPanel");
  const editNotice = document.querySelector("#marketDraftEditNotice");
  const pendingBadge = document.querySelector("#marketDraftPendingBadge");
  if (!choicePanel || !aiPanel || !editNotice || !pendingBadge) return;

  const isEditing = isEditingItemForm();
  choicePanel.classList.toggle("hidden", isEditing);
  editNotice.classList.toggle("hidden", !isEditing);
  if (isEditing) aiPanel.classList.add("hidden");
  pendingBadge.classList.toggle("hidden", !pendingDraftMarketResearch);
}

function clearPendingDraftMarketResearch() {
  pendingDraftMarketResearch = null;
  preparedDraftMarketResearch = null;

  const input = document.querySelector("#draftMarketResearchInput");
  if (input) input.value = "";
  const aiPanel = document.querySelector("#marketDraftAiPanel");
  if (aiPanel) aiPanel.classList.add("hidden");
  const preview = document.querySelector("#draftMarketResearchPreview");
  if (preview) preview.classList.add("hidden");
  const errors = document.querySelector("#draftMarketResearchErrors");
  if (errors) renderMarketResearchMessageList(errors, []);
  const warnings = document.querySelector("#draftMarketResearchParseWarnings");
  if (warnings) renderMarketResearchMessageList(warnings, []);
  renderDraftMarketResearchUiState();
}

function openMarketResearchImportDialog(itemId) {
  const item = items.find((entry) => entry.id === itemId);
  if (!item) return;

  const dialogId = "marketResearchImportDialog";
  const previouslyFocusedElement = document.activeElement;
  const existingDialog = document.querySelector(`#${dialogId}`);
  if (existingDialog) existingDialog.remove();

  const dialog = document.createElement("div");
  dialog.id = dialogId;
  dialog.className = "dialog-backdrop";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", `${dialogId}Title`);
  dialog.innerHTML = `
    <section class="mode-dialog market-research-import-dialog">
      <div class="section-title">
        <div>
          <p class="panel-eyebrow">MARKET DATA IMPORT</p>
          <h2 id="${dialogId}Title">AI相場調査JSONを取り込む</h2>
          <p>対象商品：<strong data-market-import-item-name></strong></p>
        </div>
      </div>

      <div data-market-import-paste-stage>
        <label class="market-research-import-label" for="${dialogId}Textarea">
          <span>AI相場調査JSONを貼り付け</span>
          <small>JSONだけでなく、JSONコードブロックやChatGPT回答全体も読み取れます。</small>
        </label>
        <textarea id="${dialogId}Textarea" class="market-research-import-textarea" rows="12" spellcheck="false" placeholder="ここにAIの回答またはJSONを貼り付けてください"></textarea>
        <div class="market-research-import-errors" data-market-import-errors role="alert" hidden></div>
        <div class="market-research-import-warnings" data-market-import-parse-warnings hidden></div>
        <div class="form-actions market-research-import-actions">
          <button type="button" class="primary-button" data-market-import-review>内容を確認</button>
          <button type="button" class="secondary-button" data-market-import-close>閉じる</button>
        </div>
      </div>

      <div data-market-import-preview-stage hidden>
        <h3 class="market-research-preview-title">取り込み内容の確認</h3>
        <div class="market-research-import-warnings" data-market-import-warnings hidden></div>
        <dl class="market-research-preview-grid">
          <div><dt>調査日</dt><dd data-market-preview="researchedAt"></dd></div>
          <div><dt>商品名</dt><dd data-market-preview="productName"></dd></div>
          <div><dt>メーカー</dt><dd data-market-preview="maker"></dd></div>
          <div><dt>型番</dt><dd data-market-preview="modelNumber"></dd></div>
          <div><dt>基準価格</dt><dd data-market-preview="referencePrice"></dd></div>
          <div><dt>相場中心価格</dt><dd data-market-preview="marketPriceTypical"></dd></div>
          <div><dt>価格帯</dt><dd data-market-preview="priceRange"></dd></div>
          <div><dt>在庫状況</dt><dd data-market-preview="stockStatus"></dd></div>
          <div><dt>供給状況</dt><dd data-market-preview="supplyStatus"></dd></div>
          <div><dt>価格傾向</dt><dd data-market-preview="priceTrend"></dd></div>
          <div><dt>信頼度</dt><dd data-market-preview="confidence"></dd></div>
          <div><dt>情報源</dt><dd data-market-preview="sourceCount"></dd></div>
        </dl>
        <section class="market-research-preview-section">
          <h4>市場コメント</h4>
          <p data-market-preview="marketSummary"></p>
        </section>
        <section class="market-research-preview-section">
          <h4>注意点</h4>
          <ul data-market-preview-cautions></ul>
        </section>
        <details class="market-research-preview-section market-research-source-preview">
          <summary>情報源を確認</summary>
          <ul data-market-preview-sources></ul>
        </details>
        <div class="form-actions market-research-import-actions">
          <button type="button" class="primary-button" data-market-import-save>この商品に保存</button>
          <button type="button" class="secondary-button" data-market-import-back>貼り付けに戻る</button>
          <button type="button" class="secondary-button" data-market-import-close>キャンセル</button>
        </div>
      </div>
    </section>
  `;

  const pasteStage = dialog.querySelector("[data-market-import-paste-stage]");
  const previewStage = dialog.querySelector("[data-market-import-preview-stage]");
  const textarea = dialog.querySelector(`#${dialogId}Textarea`);
  const reviewButton = dialog.querySelector("[data-market-import-review]");
  const saveButton = dialog.querySelector("[data-market-import-save]");
  const errorContainer = dialog.querySelector("[data-market-import-errors]");
  let preparedResearch = null;
  let saveInProgress = false;

  dialog.querySelector("[data-market-import-item-name]").textContent = item.name;

  const closeDialog = () => {
    dialog.remove();
    if (previouslyFocusedElement && previouslyFocusedElement.isConnected) {
      previouslyFocusedElement.focus();
    }
  };

  const showPasteStage = () => {
    preparedResearch = null;
    pasteStage.hidden = false;
    previewStage.hidden = true;
    textarea.focus();
  };

  const showPreviewStage = () => {
    const result = prepareMarketResearchImport(item, textarea.value);
    renderMarketResearchMessageList(errorContainer, result.errors);
    renderMarketResearchMessageList(
      dialog.querySelector("[data-market-import-parse-warnings]"),
      result.ok ? [] : result.warnings
    );
    if (!result.ok) {
      preparedResearch = null;
      textarea.focus();
      return;
    }

    preparedResearch = result.marketResearch;
    renderMarketResearchImportPreview(dialog, result);
    pasteStage.hidden = true;
    previewStage.hidden = false;
    saveButton.focus();
  };

  const savePreparedResearch = () => {
    if (!preparedResearch || saveInProgress) return;
    saveInProgress = true;
    saveButton.disabled = true;
    const saveResult = saveMarketResearchToItem(itemId, preparedResearch);
    if (!saveResult.ok) {
      saveInProgress = false;
      saveButton.disabled = false;
      showAiToast("対象商品が見つからず、相場調査結果を保存できませんでした。");
      return;
    }

    closeDialog();
    showAiToast("AI相場調査結果を保存しました。");
  };

  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });
  dialog.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      closeDialog();
      return;
    }
    if (event.key !== "Tab") return;
    const focusable = Array.from(dialog.querySelectorAll("button, textarea, summary, [href], input, select, [tabindex]:not([tabindex='-1'])"))
      .filter((element) => !element.disabled && !element.closest("[hidden]"));
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  dialog.querySelectorAll("[data-market-import-close]").forEach((button) => {
    button.addEventListener("click", closeDialog);
  });
  reviewButton.addEventListener("click", showPreviewStage);
  saveButton.addEventListener("click", savePreparedResearch);
  dialog.querySelector("[data-market-import-back]").addEventListener("click", showPasteStage);

  document.body.appendChild(dialog);
  textarea.focus();
}

// ==============================
// 通販検索リンク（表示専用・アフィリエイト対応）
// ==============================
// IDが空欄でも通常の検索リンクとして動作する。
// アフィリエイト提携後、下の2つの定数に自分のIDを貼るだけで有効になる。
// リンクは商品名を検索キーワードとして通販サイトに渡すだけで、
// アプリ内の保存データ・判定・履歴には一切影響しない。

const SHOP_SEARCH_CONFIG = {
  // Amazonアソシエイトのトラッキングタグ（例: "yourname-22"）
  amazonAssociateTag: "",
  // 楽天アフィリエイトID（例: "1234abcd.5678efgh"）
  rakutenAffiliateId: ""
};

function buildAmazonSearchUrl(itemName) {
  const url = new URL("https://www.amazon.co.jp/s");
  url.searchParams.set("k", itemName);

  if (SHOP_SEARCH_CONFIG.amazonAssociateTag) {
    url.searchParams.set("tag", SHOP_SEARCH_CONFIG.amazonAssociateTag);
  }

  return url.toString();
}

function buildRakutenSearchUrl(itemName) {
  const searchUrl = `https://search.rakuten.co.jp/search/mall/${encodeURIComponent(itemName)}/`;

  if (!SHOP_SEARCH_CONFIG.rakutenAffiliateId) {
    return searchUrl;
  }

  return `https://hb.afl.rakuten.co.jp/hgc/${encodeURIComponent(SHOP_SEARCH_CONFIG.rakutenAffiliateId)}/?pc=${encodeURIComponent(searchUrl)}&m=${encodeURIComponent(searchUrl)}`;
}

// 価格.comはアフィリエイトなしの純粋な検索リンク
function buildKakakuSearchUrl(itemName) {
  return `https://search.kakaku.com/${encodeURIComponent(itemName)}/`;
}

// href に使ってよいのは http / https のURLだけ（javascript:等の混入防止）
function isSafeHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch (error) {
    return false;
  }
}

function getProductUrlLinkHtml(item) {
  if (!item.productUrl || !isSafeHttpUrl(item.productUrl)) {
    return "";
  }

  return `<a class="shop-link-button shop-product-page" href="${escapeHtml(item.productUrl)}" target="_blank" rel="noopener noreferrer">登録URLを開く</a>`;
}

// 検索キーワードは商品名にメーカー・型番を足して精度を上げる（入力済みのものだけ連結）
function buildShopSearchKeyword(item) {
  return [item.name, item.maker, item.modelNumber]
    .map((value) => (value || "").trim())
    .filter(Boolean)
    .join(" ");
}

function getShopLinksHtml(item) {
  if (item.purchased || !item.name) {
    return "";
  }

  const keyword = buildShopSearchKeyword(item);

  return `
    <div class="shop-links" aria-label="相場をしらべる">
      <button type="button" class="shop-link-button shop-ai" data-action="ai-research" data-id="${escapeHtml(item.id)}">🐱 AIで相場を偵察</button>
      <button type="button" class="shop-link-button shop-market-import" data-action="ai-market-import" data-id="${escapeHtml(item.id)}">📥 AI相場調査JSONを取り込む</button>
      ${getProductUrlLinkHtml(item)}
      <div class="shop-search-row">
        <span class="pr-chip" title="アフィリエイトリンク（PR）を含みます">PR</span>
        <a class="shop-link-button shop-amazon" href="${escapeHtml(buildAmazonSearchUrl(keyword))}" target="_blank" rel="sponsored noopener noreferrer">Amazonで探す</a>
        <a class="shop-link-button shop-rakuten" href="${escapeHtml(buildRakutenSearchUrl(keyword))}" target="_blank" rel="sponsored noopener noreferrer">楽天で探す</a>
        <a class="shop-link-button shop-kakaku" href="${escapeHtml(buildKakakuSearchUrl(keyword))}" target="_blank" rel="noopener noreferrer">価格.comで探す</a>
      </div>
    </div>
  `;
}

// 表示専用：カードの開閉状態（再描画しても開いたカードを維持するため）
const openItemCardIds = new Set();

function createItemCard(item) {
  const card = document.createElement("article");
  const displayStatus = getDisplayStatus(item);
  card.className = `item-card${displayStatus.className ? ` card-${displayStatus.className}` : ""}`;

  const priceStatus = calculatePriceStatus(item);
  const priceDifference = getPurchaseDifferenceText(item);
  const comment = getDisplayCommentForItem(item);
  const legoRiskText = getLegoRiskText(item);
  const historyHtml = getJudgmentHistoryHtml(item);
  const skippedStockText = item.skipped && item.stockAddedAmount
    ? `心のヘソクリ加算額：${formatYen(item.stockAddedAmount)}`
    : "";
  const reversedHeartStockText = getLatestHeartStockReversalText(item);
  const purchaseInfoText = item.purchased
    ? `購入日：${formatDisplayDate(item.purchasedAt)} / 購入区分：${item.purchaseType || "未設定"} / 購入価格：${formatYen(item.purchasePrice)}`
    : "";
  const skippedInfoText = item.skipped && !item.purchased
    ? `見送り日：${formatDateTime(item.skippedAt)}`
    : "";
  const actionButtonsHtml = getItemActionButtonsHtml(item);
  const marketActionsHtml = getShopLinksHtml(item);
  const marketResearchCardHtml = getMarketResearchCardHtml(item);

  const hasValidJudgment = VALID_JUDGMENTS.includes(item.judgment);
  const primaryVerdictLabel = item.purchased
    ? "購入後判決"
    : (hasValidJudgment ? "推奨" : "審議状況");
  const primaryVerdictText = item.purchased
    ? item.purchaseJudgment || "購入済み"
    : (hasValidJudgment ? getRecommendedAction(item.judgment) : "まだ審議していません");

  card.innerHTML = `
    <details class="item-card-details"${openItemCardIds.has(item.id) ? " open" : ""}>
      <summary class="item-card-summary" aria-label="${escapeHtml(item.name)}の詳細を開閉">
        <div class="item-card-headline">
          <div class="item-card-heading">
            <h3>${escapeHtml(item.name)}</h3>
            <p class="item-card-subline">${escapeHtml(item.category || "カテゴリ未設定")} ／ ${escapeHtml(getDisplayItemType(item.itemType))}${item.maker ? ` ／ ${escapeHtml(item.maker)}` : ""}</p>
          </div>
          <span class="badge ${displayStatus.className}">${escapeHtml(displayStatus.label)}</span>
          <span class="item-card-caret" aria-hidden="true"></span>
        </div>
        <div class="item-card-quickstats">
          <div><span>価格基準</span><strong>${escapeHtml(getDisplayPriceBasisType(item.priceBasisType))}</strong></div>
          <div><span>基準価格</span><strong>${formatYen(item.listPrice)}</strong></div>
          <div><span>現在価格</span><strong>${formatYen(item.currentPrice)}</strong></div>
          <div class="quickstat-wide"><span>${primaryVerdictLabel}</span><strong>${escapeHtml(primaryVerdictText)}</strong></div>
        </div>
      </summary>

      <div class="item-card-body">
        <div class="item-meta">
          <span class="meta-chip">${escapeHtml(getActionStatusForItem(item))}</span>
          ${item.modelNumber ? `<span class="meta-chip">品番 ${escapeHtml(item.modelNumber)}</span>` : ""}
          ${item.councilMode ? `<span class="meta-chip">${escapeHtml(item.councilMode)}</span>` : ""}
          ${legoRiskText ? `<span class="meta-chip">${escapeHtml(legoRiskText)}</span>` : ""}
        </div>

        <div class="price-grid">
          <div><span>登録時価格</span><strong>${formatYen(item.registeredPrice)}</strong></div>
          <div><span>価格状態</span><strong>${escapeHtml(priceStatus.label)}</strong></div>
          <div><span>アクセル</span><strong>${item.acceleratorScore || "-"}</strong></div>
          <div><span>ブレーキ</span><strong>${item.brakeScore || "-"}</strong></div>
        </div>

        ${marketResearchCardHtml}
        <div class="comment-box">${escapeHtml(comment)}</div>
        ${historyHtml}
        ${item.memo ? `<p class="memo">${escapeHtml(item.memo)}</p>` : ""}
        ${purchaseInfoText ? `<p class="memo">${escapeHtml(purchaseInfoText)}</p>` : ""}
        ${skippedInfoText ? `<p class="memo">${escapeHtml(skippedInfoText)}</p>` : ""}
        ${priceDifference ? `<p class="memo">${escapeHtml(priceDifference)}</p>` : ""}
        ${skippedStockText ? `<p class="memo">${escapeHtml(skippedStockText)}</p>` : ""}
        ${reversedHeartStockText ? `<p class="memo">${escapeHtml(reversedHeartStockText)}</p>` : ""}

        <div class="card-actions">
          ${actionButtonsHtml}
        </div>
      </div>
    </details>
    ${marketActionsHtml}
  `;

  const details = card.querySelector(".item-card-details");
  details.addEventListener("toggle", () => {
    if (details.open) {
      openItemCardIds.add(item.id);
    } else {
      openItemCardIds.delete(item.id);
    }
  });

  return card;
}

function getItemActionButtonsHtml(item) {
  const safeItemId = escapeHtml(item.id);
  const commonButtons = `
    <button type="button" class="secondary-button" data-action="edit" data-id="${safeItemId}">編集</button>
    <button type="button" class="danger-button" data-action="delete" data-id="${safeItemId}">削除</button>
  `;

  if (item.purchased) {
    return commonButtons;
  }

  if (item.skipped) {
    return `
      <button type="button" class="secondary-button" data-action="purchase" data-id="${safeItemId}">後から買った</button>
      <button type="button" class="secondary-button" data-action="undo-skip" data-id="${safeItemId}">見送りを取り消す</button>
      ${commonButtons}
    `;
  }

  return `
    <button type="button" class="primary-button" data-action="judge" data-id="${safeItemId}">審議する</button>
    ${commonButtons}
    <button type="button" class="secondary-button" data-action="purchase" data-id="${safeItemId}">買った</button>
    <button type="button" class="secondary-button" data-action="skip" data-id="${safeItemId}">見送った</button>
  `;
}

function getJudgmentHistoryHtml(item) {
  if (!item.judgmentHistory || item.judgmentHistory.length === 0) {
    return "";
  }

  const entries = item.judgmentHistory
    .slice(-3)
    .reverse()
    .map((entry) => {
      const typeLabel = getHistoryTypeLabel(entry);
      const entryDate = getHistoryEntryDate(entry);
      const purchaseText = entry.type === "purchase"
        ? ` / ${formatYen(entry.purchasePrice)} / ${escapeHtml(entry.purchaseType || "")}`
        : "";
      const skipText = entry.type === "skip"
        ? ` / ヘソクリ加算 ${formatYen(entry.addedHeartStock)}`
        : "";
      const reversalText = entry.heartStockReversedAmount
        ? ` / ヘソクリ差し戻し ${formatYen(entry.heartStockReversedAmount)}`
        : "";
      const reviewVersionText = entry.type === "review" && entry.reviewVersion
        ? ` / ${escapeHtml(entry.reviewVersion)} / 欲しい強さ:${escapeHtml(entry.desireLevel || "-")} / 買い時:${escapeHtml(entry.timingLevel || "-")} / 危険度:${escapeHtml(entry.riskLevel || "-")}`
        : "";
      return `
        <li>
          <span>${escapeHtml(formatDateTime(entryDate))}</span>
          <strong>${escapeHtml(typeLabel)}：${escapeHtml(entry.councilMode || "")}：${escapeHtml(entry.judgment || "")}${reviewVersionText}${purchaseText}${skipText}${reversalText}</strong>
        </li>
      `;
    })
    .join("");

  return `
    <details class="history-box">
      <summary>審議履歴 ${item.judgmentHistory.length}件</summary>
      <ul>${entries}</ul>
    </details>
  `;
}

function getLatestHeartStockReversalText(item) {
  if (!Array.isArray(item.judgmentHistory)) {
    return "";
  }

  const latestReversal = item.judgmentHistory
    .slice()
    .reverse()
    .find((entry) => entry.type === "purchase" && toNumber(entry.heartStockReversedAmount) > 0);

  if (!latestReversal) {
    return "";
  }

  return `見送り済みから購入に変更したため、心のヘソクリから ${formatYen(latestReversal.heartStockReversedAmount)} を差し戻しました。`;
}

function getDisplayCommentForItem(item) {
  if (item.purchaseJudgmentComment) {
    return item.purchaseJudgmentComment;
  }

  if (item.judgmentComment) {
    return stripJudgmentHeadingLines(item.judgmentComment);
  }

  return "まだ審議されていません。";
}

function fillSelect(selector, options, selectedValue) {
  const select = document.querySelector(selector);
  select.innerHTML = "";

  options.forEach((option) => {
    const optionElement = document.createElement("option");
    optionElement.value = option;
    optionElement.textContent = option;
    optionElement.selected = option === selectedValue;
    select.appendChild(optionElement);
  });
}

// ==============================
// イベント処理
// ==============================

function setupEvents() {
  document.querySelectorAll(".tab-button").forEach((button) => {
    button.addEventListener("click", () => setActiveTab(button.dataset.tab));
  });
  document.querySelector("#consideringFilterBar").addEventListener("click", handleConsideringFilterClick);
  document.querySelector("#settingsForm").addEventListener("submit", handleSettingsSubmit);
  document.querySelector("#editHeartStockButton").addEventListener("click", editHeartStockManually);
  document.querySelector("#resetHeartStockButton").addEventListener("click", resetHeartStock);
  document.querySelector("#resetMonthlyBudgetButton").addEventListener("click", resetMonthlyBudget);
  document.querySelector("#exportDataButton").addEventListener("click", exportData);
  document.querySelector("#importDataButton").addEventListener("click", () => document.querySelector("#importDataInput").click());
  document.querySelector("#importDataInput").addEventListener("change", handleImportDataFileSelect);
  document.querySelector("#exportDiagnosticReportButton").addEventListener("click", exportDiagnosticReport);
  document.querySelector("#resetTestDataButton").addEventListener("click", resetTestData);
  document.querySelector("#itemForm").addEventListener("submit", handleItemSubmit);
  document.querySelector("#itemForm").addEventListener("keydown", preventItemFormEnterSubmit);
  document.querySelector("#cancelEditButton").addEventListener("click", resetItemForm);
  document.querySelector("#judgeAddedItemButton").addEventListener("click", judgeLastAddedItem);
  document.querySelector("#viewAddedItemButton").addEventListener("click", viewLastAddedItem);
  document.querySelector("#addAnotherItemButton").addEventListener("click", prepareAnotherItem);
  document.querySelectorAll(".items-list").forEach((list) => {
    list.addEventListener("click", handleItemAction);
  });
  document.querySelector("#modeDialogCancelButton").addEventListener("click", () => closeModeDialog());
  document.querySelector("#modeDialog").addEventListener("click", handleModeDialogBackdropClick);
  document.querySelector("#reviewPresentationFilterButton").addEventListener("click", handleReviewPresentationFilterClick);
  document.querySelector("#reviewPresentationCloseButton").addEventListener("click", () => closeReviewPresentation("all"));
  document.querySelector("#reviewPresentationSkipButton").addEventListener("click", skipReviewPresentation);
  document.querySelector("#reviewPresentationDialog").addEventListener("click", handleReviewPresentationBackdropClick);
  document.querySelector("#reviewPresentationImage").addEventListener("error", showReviewPresentationFallback);
  document.querySelector("#purchaseForm").addEventListener("submit", handlePurchaseProceed);
  document.querySelector("#purchaseForm").addEventListener("keydown", preventPurchaseFormEnterSubmit);
  document.querySelector("#purchaseCancelButton").addEventListener("click", closePurchaseDialog);
  document.querySelector("#purchaseConfirmButton").addEventListener("click", confirmPurchaseSave);
  document.querySelector("#purchaseDialog").addEventListener("click", handlePurchaseDialogBackdropClick);
  document.querySelector("#budgetStartDateInput").addEventListener("change", handleBudgetStartDateChange);
  document.querySelector("#categoryInput").addEventListener("input", handleCategoryChange);
  document.querySelector("#releaseDateInput").addEventListener("change", applyLegoRarityRiskIfNeeded);
  document.querySelector("#priceBasisTypeInput").addEventListener("change", handlePriceBasisChange);
  document.querySelector("#listPriceInput").addEventListener("input", renderFormPriceStatus);
  document.querySelector("#registeredPriceInput").addEventListener("input", handleRegisteredPriceInput);
  document.querySelector("#currentPriceInput").addEventListener("input", renderFormPriceStatus);
  document.querySelector("#draftAiRouteButton").addEventListener("click", handleDraftAiResearch);
  document.querySelector("#draftManualRouteButton").addEventListener("click", () => setItemFormWizardStep(3));
  document.querySelector("#draftAiPromptButton").addEventListener("click", handleDraftAiResearch);
  document.querySelector("#draftMarketResearchReviewButton").addEventListener("click", handleDraftMarketResearchReview);
  document.querySelector("#draftMarketResearchApplyButton").addEventListener("click", applyPreparedDraftMarketResearch);
  document.querySelector("#draftMarketResearchBackButton").addEventListener("click", hideDraftMarketResearchPreview);
  document.querySelector("#draftMarketResearchCloseButton").addEventListener("click", closeDraftMarketResearchPanel);

  scoreInputIds.forEach((id) => {
    const input = document.querySelector(`#${id}`);
    input.addEventListener("input", () => {
      input.nextElementSibling.textContent = input.value;
      if (id === "rarityRiskScoreInput") {
        markRarityRiskManualOverride();
      }
    });
  });
}

async function handleImportDataFileSelect(event) {
  const file = event.target.files && event.target.files[0];
  await importData(file);
  event.target.value = "";
}

function setActiveTab(tabName) {
  if (!APP_TABS.includes(tabName)) {
    return;
  }

  activeTab = tabName;
  renderTabs();
}

function handleConsideringFilterClick(event) {
  const button = event.target.closest("button");
  if (!button) return;

  event.preventDefault();

  const filter = button.dataset.filter;
  if (!CONSIDERING_FILTERS.some((option) => option.key === filter)) {
    return;
  }

  consideringFilter = filter;
  renderConsideringFilters();
  renderItems();
}

function handleSettingsSubmit(event) {
  event.preventDefault();

  const defaultPeriod = getDefaultBudgetPeriod();
  const budgetStartDate = document.querySelector("#budgetStartDateInput").value || defaultPeriod.start;
  const budgetEndDate = document.querySelector("#budgetEndDateInput").value || defaultPeriod.end;

  if (!isValidBudgetPeriod(budgetStartDate, budgetEndDate)) {
    alert("予算期間終了日は、予算期間開始日以降の日付にしてください。");
    return;
  }

  settings.monthlyBudget = toNumber(document.querySelector("#monthlyBudgetInput").value);
  settings.budgetStartDate = budgetStartDate;
  settings.budgetEndDate = budgetEndDate;
  settings.defaultCouncilMode = getSelectableCouncilMode(document.querySelector("#defaultCouncilModeInput").value);
  settings = normalizeSettings(settings);

  saveSettings();
  renderAll();
}

function handleBudgetStartDateChange() {
  const startDate = document.querySelector("#budgetStartDateInput").value;
  if (!startDate) return;

  document.querySelector("#budgetEndDateInput").value = getAutoBudgetEndDate(startDate);
}

function editHeartStockManually() {
  const message = "心のヘソクリは精神的資産であり、現実の予算ではありません。手動編集しても家計簿上のお金は増えません。\n\n新しい心のヘソクリ残高を入力してください。";
  const input = prompt(message, String(toNumber(settings.heartStock)));
  if (input === null) return;

  const newAmount = toNumber(input);
  if (newAmount < 0) {
    alert("心のヘソクリにマイナス値は設定できません。");
    return;
  }

  const confirmed = confirm(`心のヘソクリを ${formatYen(newAmount)} に変更しますか？`);
  if (!confirmed) return;

  settings.heartStock = newAmount;
  saveSettings();
  renderAll();
}

function resetHeartStock() {
  const confirmed = confirm("心のヘソクリを0にリセットします。\n\n心のヘソクリを手動リセットすると、過去の見送り商品に記録された加算額との合計とは一致しなくなる場合があります。\n\n実行しますか？");
  if (!confirmed) return;

  settings.heartStock = 0;
  saveSettings();
  renderAll();
}

function resetMonthlyBudget() {
  const confirmed = confirm("当期間趣味予算を0にリセットします。\n\n期間内使用額は購入履歴から自動計算されるため、この操作ではリセットされません。\n\n実行しますか？");
  if (!confirmed) return;

  settings.monthlyBudget = 0;
  saveSettings();
  renderAll();
}

function handleItemSubmit(event) {
  event.preventDefault();

  if (!event.submitter || event.submitter.id !== "itemSaveButton") {
    return;
  }

  const editingItemId = document.querySelector("#editingItemId").value;
  const now = new Date().toISOString();
  const formItem = getItemFromForm();

  if (!validateItemForm(formItem)) {
    return;
  }

  if (editingItemId) {
    items = items.map((item) => {
      if (item.id !== editingItemId) return item;
      return {
        ...item,
        ...formItem,
        updatedAt: now
      };
    });
  } else {
    const newItemId = generateId();
    formItem.currentPrice = formItem.registeredPrice;
    const initialMarketResearchHistory = pendingDraftMarketResearch
      ? [{
        ...mergeWithDefaultMarketResearch(pendingDraftMarketResearch),
        importedAt: pendingDraftMarketResearch.importedAt || now,
        importSource: pendingDraftMarketResearch.importSource || MARKET_RESEARCH_MANUAL_IMPORT_SOURCE
      }]
      : [];
    items.push({
      ...createEmptyItem(),
      ...formItem,
      id: newItemId,
      createdAt: now,
      updatedAt: now,
      marketResearchHistory: initialMarketResearchHistory
    });
    pendingDraftMarketResearch = null;
    preparedDraftMarketResearch = null;
    lastAddedItemId = newItemId;
  }

  const nextTab = editingItemId ? itemFormReturnTab : "considering";

  saveItems();
  resetItemForm();
  activeTab = editingItemId ? nextTab : "form";
  renderAll();

  if (!editingItemId) {
    showItemAddedPanel(lastAddedItemId);
  }
}

function preventItemFormEnterSubmit(event) {
  if (event.key !== "Enter") {
    return;
  }

  if (event.target.tagName === "TEXTAREA") {
    return;
  }

  event.preventDefault();
}

function preventPurchaseFormEnterSubmit(event) {
  if (event.key !== "Enter") {
    return;
  }

  event.preventDefault();
}

function handleItemAction(event) {
  const button = event.target.closest("button");
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const action = button.dataset.action;
  const itemId = button.dataset.id;

  switch (action) {
    case "judge":
      judgeAndSaveItem(itemId);
      return;
    case "edit":
      startEditItem(itemId);
      return;
    case "delete":
      deleteItem(itemId);
      return;
    case "purchase":
      openPurchaseDialog(itemId);
      return;
    case "skip":
      markSkipped(itemId);
      return;
    case "undo-skip":
      undoSkipped(itemId);
      return;
    case "ai-research":
      handleAiResearch(itemId);
      return;
    case "ai-market-import":
      openMarketResearchImportDialog(itemId);
      return;
    default:
      return;
  }
}

async function judgeAndSaveItem(itemId) {
  const item = items.find((target) => target.id === itemId);
  if (!item) return;

  if (!hasValidMonthlyBudget()) {
    showMonthlyBudgetRequiredNotice();
    return;
  }

  const selectedMode = await chooseCouncilMode(getPreferredCouncilMode(item));
  if (!selectedMode) return;

  runPrePurchaseReview(itemId, selectedMode);
}

function runPrePurchaseReview(itemId, selectedMode) {
  if (!hasValidMonthlyBudget()) {
    showMonthlyBudgetRequiredNotice();
    return;
  }

  const reviewMode = getSelectableCouncilMode(selectedMode);
  const heartStockBeforeJudgment = settings.heartStock;
  let presentationResult = null;

  items = items.map((targetItem) => {
    if (targetItem.id !== itemId) return targetItem;

    const result = judgeItem(targetItem, reviewMode);
    const historyEntry = createJudgmentHistoryEntry(result);
    const {
      reviewPriceStatusKey,
      reviewPriceDeviationRate,
      reviewReasonLines,
      reviewReasonTags,
      ...latestReviewResult
    } = result;
    presentationResult = {
      itemName: targetItem.name,
      councilMode: reviewMode,
      judgment: result.judgment,
      judgmentComment: result.judgmentComment
    };

    return {
      ...targetItem,
      ...latestReviewResult,
      status: getActionStatusForItem(targetItem),
      skipped: targetItem.skipped,
      skippedAt: targetItem.skippedAt,
      stockAddedAmount: targetItem.stockAddedAmount,
      judgedAt: historyEntry.judgedAt,
      judgmentHistory: [...(targetItem.judgmentHistory || []), historyEntry],
      updatedAt: new Date().toISOString()
    };
  });

  // 購入前審議は助言だけです。心のヘソクリは、見送り確定時だけ加算します。
  // 「通常審議モード」は評議会モード名であり、この処理は全モードの購入前審議に共通です。
  // この経路では settings.heartStock を保存しません。
  settings.heartStock = heartStockBeforeJudgment;
  saveItems();
  renderAll();

  if (presentationResult) {
    showReviewPresentation(presentationResult);
  }
}

function judgeLastAddedItem() {
  const item = items.find((target) => target.id === lastAddedItemId);
  if (!item) return;

  hideItemAddedPanel();
  runPrePurchaseReview(item.id, getSelectableCouncilMode(item.councilMode));
}

function viewLastAddedItem() {
  hideItemAddedPanel();
  activeTab = "considering";
  consideringFilter = "all";
  renderAll();
}

function prepareAnotherItem() {
  hideItemAddedPanel();
  resetItemForm();
  activeTab = "form";
  renderAll();
  document.querySelector("#nameInput").focus();
}

function showItemAddedPanel(itemId) {
  const item = items.find((target) => target.id === itemId);
  if (!item) return;

  const panel = document.querySelector("#itemAddedPanel");
  document.querySelector("#itemAddedName").textContent = `「${item.name}」`;
  panel.classList.remove("hidden");
}

function hideItemAddedPanel() {
  document.querySelector("#itemAddedPanel").classList.add("hidden");
}

function startEditItem(itemId) {
  const item = items.find((target) => target.id === itemId);
  if (!item) return;

  hideItemAddedPanel();
  activeTab = "form";
  itemFormReturnTab = getTabNameForItem(item);
  renderTabs();
  document.querySelector("#itemFormTitle").textContent = "商品編集";
  document.querySelector("#editingItemId").value = item.id;
  clearPendingDraftMarketResearch();
  document.querySelector("#nameInput").value = item.name;
  document.querySelector("#categoryInput").value = item.category;
  document.querySelector("#makerInput").value = item.maker || "";
  document.querySelector("#modelNumberInput").value = item.modelNumber || "";
  document.querySelector("#productUrlInput").value = item.productUrl || "";
  document.querySelector("#itemTypeInput").value = getSelectableItemType(item.itemType);
  document.querySelector("#priceBasisTypeInput").value = getSelectablePriceBasisType(item.priceBasisType);
  document.querySelector("#listPriceInput").value = item.listPrice || "";
  document.querySelector("#registeredPriceInput").value = item.registeredPrice || "";
  document.querySelector("#currentPriceInput").value = item.currentPrice || "";
  document.querySelector("#targetPriceInput").value = item.targetPrice || "";
  document.querySelector("#maxAcceptablePriceInput").value = item.maxAcceptablePrice || "";
  document.querySelector("#memoInput").value = item.memo;
  document.querySelector("#councilModeInput").value = getSelectableCouncilMode(item.councilMode);
  document.querySelector("#releaseDateInput").value = item.releaseDate || "";
  document.querySelector("#rarityRiskScoreInput").dataset.manualOverride = item.rarityRiskManualOverride ? "true" : "false";

  setScoreValue("wantScoreInput", item.wantScore);
  setScoreValue("regretScoreInput", item.regretScore);
  setScoreValue("rarityRiskScoreInput", item.rarityRiskScore);
  setScoreValue("longEnjoymentScoreInput", item.longEnjoymentScore);
  setScoreValue("spaceRiskScoreInput", item.spaceRiskScore);
  setScoreValue("overbuyScoreInput", item.overbuyScore);
  setScoreValue("explanationDifficultyScoreInput", item.explanationDifficultyScore);
  setScoreValue("backlogRiskScoreInput", item.backlogRiskScore);

  document.querySelector("#cancelEditButton").classList.remove("hidden");
  updateCurrentPriceField();
  updatePriceBasisField();
  renderFormPriceStatus();
  updateLegoReleaseDateField();
  renderDraftMarketResearchUiState();
  showItemFormWizardAllMode();
  document.querySelector("#itemForm").scrollIntoView({ behavior: "smooth", block: "start" });
}

function deleteItem(itemId) {
  const item = items.find((target) => target.id === itemId);
  if (!item) return;

  const confirmed = confirm(`「${item.name}」を削除しますか？`);
  if (!confirmed) return;

  items = items.filter((target) => target.id !== itemId);
  saveItems();
  renderAll();
}

function openPurchaseDialog(itemId) {
  const item = items.find((target) => target.id === itemId);
  if (!item) return;

  if (!hasPrePurchaseReview(item)) {
    showPrePurchaseRequiredNotice("purchase");
    return;
  }

  if (!hasValidMonthlyBudget()) {
    showMonthlyBudgetRequiredNotice();
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  pendingPurchase = {
    itemId,
    purchasedAt: item.purchasedAt || today,
    purchasePrice: item.purchasePrice || item.currentPrice || item.registeredPrice || 0,
    purchaseType: PURCHASE_TYPES.includes(item.purchaseType) ? item.purchaseType : "定価購入",
    councilMode: "",
    verdict: null
  };

  document.querySelector("#purchaseDateInput").value = pendingPurchase.purchasedAt;
  document.querySelector("#purchasePriceInput").value = pendingPurchase.purchasePrice;
  renderPurchaseTypeOptions(pendingPurchase.purchaseType);
  resetPurchaseVerdict();
  document.querySelector("#purchaseDialog").classList.remove("hidden");
}

function renderPurchaseTypeOptions(selectedType) {
  const options = document.querySelector("#purchaseTypeOptions");
  options.innerHTML = "";

  PURCHASE_TYPES.forEach((type) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mode-option-button${type === selectedType ? " selected" : ""}`;
    button.textContent = type;
    button.setAttribute("aria-pressed", type === selectedType ? "true" : "false");
    button.addEventListener("click", () => {
      if (!pendingPurchase) return;
      pendingPurchase.purchaseType = type;
      renderPurchaseTypeOptions(type);
      resetPurchaseVerdict();
    });
    options.appendChild(button);
  });
}

async function handlePurchaseProceed(event) {
  event.preventDefault();
  if (!pendingPurchase) return;

  const item = items.find((target) => target.id === pendingPurchase.itemId);
  if (!item) return;

  if (!hasValidMonthlyBudget()) {
    showMonthlyBudgetRequiredNotice();
    return;
  }

  pendingPurchase.purchasedAt = document.querySelector("#purchaseDateInput").value;
  pendingPurchase.purchasePrice = toNumber(document.querySelector("#purchasePriceInput").value);

  const selectedMode = await chooseCouncilMode(getPreferredCouncilMode(item));
  if (!selectedMode) return;

  pendingPurchase.councilMode = selectedMode;
  pendingPurchase.verdict = judgePurchase(item, pendingPurchase, selectedMode);
  renderPurchaseVerdict(pendingPurchase.verdict);
  showPurchasePresentation(item, pendingPurchase.verdict);
}

function renderPurchaseVerdict(verdict) {
  const box = document.querySelector("#purchaseVerdictBox");
  box.classList.remove("hidden");
  box.innerHTML = `
    <div class="comment-box">${escapeHtml(stripJudgmentHeadingLines(verdict.comment))}</div>
    <div class="score-result">
      <div><span>購入後判決</span><strong>${escapeHtml(verdict.judgment)}</strong></div>
      <div><span>評議会モード</span><strong>${escapeHtml(verdict.councilMode)}</strong></div>
      <div><span>予算影響</span><strong>${escapeHtml(verdict.budgetImpact)}</strong></div>
    </div>
  `;

  document.querySelector("#purchaseProceedButton").textContent = "評議会モードを選び直す";
  document.querySelector("#purchaseUnsavedNotice").classList.remove("hidden");
  document.querySelector("#purchaseConfirmButton").classList.remove("hidden");
}

function resetPurchaseVerdict() {
  const box = document.querySelector("#purchaseVerdictBox");
  box.classList.add("hidden");
  box.innerHTML = "";
  document.querySelector("#purchaseProceedButton").textContent = "購入後評議会へ進む";
  document.querySelector("#purchaseUnsavedNotice").classList.add("hidden");
  document.querySelector("#purchaseConfirmButton").classList.add("hidden");

  if (pendingPurchase) {
    pendingPurchase.verdict = null;
    pendingPurchase.councilMode = "";
  }
}

function confirmPurchaseSave() {
  if (!pendingPurchase || !pendingPurchase.verdict) {
    return;
  }

  const item = items.find((target) => target.id === pendingPurchase.itemId);
  if (!item) return;

  const reversal = reverseHeartStockForPurchase(item);
  pendingPurchase.wasSkippedBeforePurchase = reversal.wasSkippedBeforePurchase;
  pendingPurchase.heartStockReversedAmount = reversal.heartStockReversedAmount;
  const historyEntry = createPurchaseHistoryEntry(pendingPurchase.verdict, pendingPurchase, item);

  items = items.map((target) => {
    if (target.id !== pendingPurchase.itemId) return target;

    return {
      ...target,
      status: "購入済み",
      purchased: true,
      purchasedAt: pendingPurchase.purchasedAt,
      currentPrice: pendingPurchase.purchasePrice,
      purchasePrice: pendingPurchase.purchasePrice,
      purchaseType: pendingPurchase.purchaseType,
      purchaseJudgment: pendingPurchase.verdict.judgment,
      purchaseJudgmentComment: pendingPurchase.verdict.comment,
      councilMode: pendingPurchase.councilMode,
      skipped: false,
      skippedAt: "",
      stockAddedAmount: 0,
      judgmentHistory: [...(target.judgmentHistory || []), historyEntry],
      updatedAt: new Date().toISOString()
    };
  });

  saveSettings();
  saveItems();
  closePurchaseDialog();
  activeTab = "purchased";
  renderAll();
}

function reverseHeartStockForPurchase(item) {
  const wasSkippedBeforePurchase = Boolean(item.skipped);
  const plannedReversalAmount = wasSkippedBeforePurchase
    ? Math.max(0, toNumber(item.stockAddedAmount))
    : 0;
  const heartStockReversedAmount = Math.min(toNumber(settings.heartStock), plannedReversalAmount);

  if (heartStockReversedAmount > 0) {
    settings.heartStock = toNumber(settings.heartStock) - heartStockReversedAmount;
  }

  return {
    wasSkippedBeforePurchase,
    heartStockReversedAmount
  };
}

function closePurchaseDialog() {
  document.querySelector("#purchaseDialog").classList.add("hidden");
  pendingPurchase = null;
  resetPurchaseVerdict();
}

function handlePurchaseDialogBackdropClick(event) {
  if (event.target.id === "purchaseDialog") {
    closePurchaseDialog();
  }
}

function markSkipped(itemId) {
  const targetItem = items.find((item) => item.id === itemId);
  if (!targetItem) return;

  if (!hasPrePurchaseReview(targetItem)) {
    showPrePurchaseRequiredNotice("skip");
    return;
  }

  if (targetItem.skipped) {
    return;
  }

  items = items.map((item) => {
    if (item.id !== itemId) return item;

    const skippedAt = item.skippedAt || new Date().toISOString();
    const stockAddedAmount = addHeartStockForSkippedItem(item);
    const existingHistory = Array.isArray(item.judgmentHistory) ? item.judgmentHistory : [];
    const skipHistoryEntry = createSkipHistoryEntry(item, stockAddedAmount, skippedAt);
    const judgmentHistory = hasSkipHistory(item)
      ? existingHistory
      : [...existingHistory, skipHistoryEntry];

    return {
      ...item,
      status: "見送り済み",
      skipped: true,
      skippedAt,
      stockAddedAmount,
      judgmentHistory,
      updatedAt: new Date().toISOString()
    };
  });

  saveSettings();
  saveItems();
  activeTab = "skipped";
  renderAll();
}

function showPrePurchaseRequiredNotice(actionType) {
  const isSkipAction = actionType === "skip";
  showActionBlockedNotice({
    dialogId: "prePurchaseRequiredDialog",
    titleId: "prePurchaseRequiredTitle",
    title: "購入前審議が必要です",
    message: isSkipAction
      ? "見送りを確定する前に、先に購入前審議を実行してください。"
      : "購入後評議会へ進む前に、先に購入前審議を実行してください。"
  });
}

function showMonthlyBudgetRequiredNotice() {
  showActionBlockedNotice({
    dialogId: "monthlyBudgetRequiredDialog",
    titleId: "monthlyBudgetRequiredTitle",
    title: "月予算が必要です",
    message: "月予算が設定されていません。審議を行う前に、設定画面で月予算を入力してください。"
  });
}

function showActionBlockedNotice({ dialogId, titleId, title, message }) {
  const existingDialog = document.querySelector(`#${dialogId}`);
  if (existingDialog) {
    existingDialog.remove();
  }

  const dialog = document.createElement("div");
  dialog.id = dialogId;
  dialog.className = "dialog-backdrop";
  dialog.setAttribute("role", "dialog");
  dialog.setAttribute("aria-modal", "true");
  dialog.setAttribute("aria-labelledby", titleId);
  dialog.innerHTML = `
    <section class="mode-dialog">
      <div class="section-title">
        <h2 id="${titleId}">${escapeHtml(title)}</h2>
        <p>${escapeHtml(message)}</p>
      </div>
      <div class="form-actions">
        <button type="button" class="secondary-button" id="${dialogId}CloseButton">閉じる</button>
      </div>
    </section>
  `;

  const closeNotice = () => dialog.remove();
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) {
      closeNotice();
    }
  });
  dialog.querySelector(`#${dialogId}CloseButton`).addEventListener("click", closeNotice);
  document.body.appendChild(dialog);
}

function undoSkipped(itemId) {
  const item = items.find((entry) => entry.id === itemId);
  if (!item || item.skipped !== true || item.purchased === true) return;

  const amountToReverse = Math.max(0, toNumber(item.stockAddedAmount));
  const confirmed = confirm("この商品の見送りを取り消して、検討中に戻しますか？\n心のヘソクリに加算された金額も差し戻されます。");
  if (!confirmed) return;

  settings.heartStock = Math.max(0, toNumber(settings.heartStock) - amountToReverse);
  items = items.map((entry) => {
    if (entry.id !== itemId) return entry;

    return {
      ...entry,
      status: "検討中",
      skipped: false,
      skippedAt: "",
      stockAddedAmount: 0,
      updatedAt: new Date().toISOString()
    };
  });

  activeTab = "considering";
  consideringFilter = "all";
  saveData();
  renderAll();
}

// この関数は「見送った」ボタンで見送りが確定した時以外には呼ばないでください。
function addHeartStockForSkippedItem(item) {
  const stockAddedAmount = item.stockAddedAmount || toNumber(item.currentPrice);

  // すでに見送った商品は、心のヘソクリを二重加算しません。
  if (!item.skipped) {
    settings.heartStock += stockAddedAmount;
  }

  return stockAddedAmount;
}

function getItemFromForm() {
  const editingItemId = document.querySelector("#editingItemId").value;
  const releaseDate = document.querySelector("#releaseDateInput").value;
  const priceBasisType = getSelectablePriceBasisType(document.querySelector("#priceBasisTypeInput").value);
  const autoRisk = isLegoCategory(document.querySelector("#categoryInput").value)
    ? calculateLegoRarityRisk(releaseDate)
    : null;

  return {
    name: document.querySelector("#nameInput").value.trim(),
    category: document.querySelector("#categoryInput").value.trim(),
    maker: document.querySelector("#makerInput").value.trim(),
    modelNumber: document.querySelector("#modelNumberInput").value.trim(),
    productUrl: document.querySelector("#productUrlInput").value.trim(),
    itemType: getSelectableItemType(document.querySelector("#itemTypeInput").value),
    priceBasisType,
    listPrice: priceBasisType === UNKNOWN_PRICE_BASIS_TYPE ? 0 : toNumber(document.querySelector("#listPriceInput").value),
    registeredPrice: toNumber(document.querySelector("#registeredPriceInput").value),
    currentPrice: editingItemId
      ? toNumber(document.querySelector("#currentPriceInput").value)
      : toNumber(document.querySelector("#registeredPriceInput").value),
    targetPrice: toNumber(document.querySelector("#targetPriceInput").value),
    maxAcceptablePrice: toNumber(document.querySelector("#maxAcceptablePriceInput").value),
    memo: document.querySelector("#memoInput").value.trim(),
    releaseDate,
    rarityRiskAutoScore: autoRisk ? autoRisk.score : 0,
    rarityRiskAutoLevel: autoRisk ? autoRisk.level : 0,
    rarityRiskManualOverride: document.querySelector("#rarityRiskScoreInput").dataset.manualOverride === "true",
    wantScore: toNumber(document.querySelector("#wantScoreInput").value),
    regretScore: toNumber(document.querySelector("#regretScoreInput").value),
    rarityRiskScore: toNumber(document.querySelector("#rarityRiskScoreInput").value),
    longEnjoymentScore: toNumber(document.querySelector("#longEnjoymentScoreInput").value),
    spaceRiskScore: toNumber(document.querySelector("#spaceRiskScoreInput").value),
    overbuyScore: toNumber(document.querySelector("#overbuyScoreInput").value),
    explanationDifficultyScore: toNumber(document.querySelector("#explanationDifficultyScoreInput").value),
    backlogRiskScore: toNumber(document.querySelector("#backlogRiskScoreInput").value),
    councilMode: document.querySelector("#councilModeInput").value
  };
}

function validateItemForm(formItem) {
  if (formItem.priceBasisType !== UNKNOWN_PRICE_BASIS_TYPE && toNumber(formItem.listPrice) <= 0) {
    alert("価格基準を使う場合は、基準価格を1円以上で入力してください。\n基準価格が分からない場合は「基準価格なし・不明」を選んでください。");
    return false;
  }

  return true;
}

function createEmptyItem() {
  return {
    id: "",
    name: "",
    category: "",
    maker: "",
    modelNumber: "",
    productUrl: "",
    itemType: DEFAULT_ITEM_TYPE,
    status: "検討中",
    priceBasisType: DEFAULT_PRICE_BASIS_TYPE,
    listPrice: 0,
    registeredPrice: 0,
    currentPrice: 0,
    targetPrice: 0,
    maxAcceptablePrice: 0,
    memo: "",
    releaseDate: "",
    scoreScale: 10,
    rarityRiskAutoScore: 0,
    rarityRiskAutoLevel: 0,
    rarityRiskManualOverride: false,
    wantScore: DEFAULT_SCORE,
    regretScore: DEFAULT_SCORE,
    rarityRiskScore: DEFAULT_SCORE,
    longEnjoymentScore: DEFAULT_SCORE,
    spaceRiskScore: DEFAULT_SCORE,
    overbuyScore: DEFAULT_SCORE,
    explanationDifficultyScore: DEFAULT_SCORE,
    backlogRiskScore: DEFAULT_SCORE,
    councilMode: getSelectableCouncilMode(settings.defaultCouncilMode),
    createdAt: "",
    updatedAt: "",
    judgedAt: "",
    reviewVersion: "",
    judgment: "",
    baseJudgment: "",
    finalJudgment: "",
    judgmentComment: "",
    modeComment: "",
    acceleratorScore: 0,
    brakeScore: 0,
    desireScore: 0,
    timingScore: 0,
    riskScore: 0,
    desireLevel: "",
    timingLevel: "",
    riskLevel: "",
    gateSource: "none",
    hardRisk: false,
    modeAdjustmentApplied: false,
    modeAdjustmentSummary: "",
    purchased: false,
    purchasedAt: "",
    purchasePrice: 0,
    purchaseType: "",
    purchaseJudgment: "",
    purchaseJudgmentComment: "",
    skipped: false,
    skippedAt: "",
    stockAddedAmount: 0,
    judgmentHistory: [],
    marketResearchHistory: []
  };
}

function resetItemForm() {
  document.querySelector("#itemForm").reset();
  document.querySelector("#itemFormTitle").textContent = "商品登録";
  document.querySelector("#editingItemId").value = "";
  clearPendingDraftMarketResearch();
  itemFormReturnTab = "considering";
  hideItemAddedPanel();
  document.querySelector("#itemTypeInput").value = DEFAULT_ITEM_TYPE;
  document.querySelector("#priceBasisTypeInput").value = DEFAULT_PRICE_BASIS_TYPE;
  document.querySelector("#councilModeInput").value = getSelectableCouncilMode(settings.defaultCouncilMode);
  document.querySelector("#rarityRiskScoreInput").dataset.manualOverride = "false";
  document.querySelector("#cancelEditButton").classList.add("hidden");

  scoreInputIds.forEach((id) => setScoreValue(id, DEFAULT_SCORE));
  updateCurrentPriceField();
  updatePriceBasisField();
  renderFormPriceStatus();
  updateLegoReleaseDateField();
  resetItemFormWizardDisplay();
}

// ==============================
// 商品フォーム 対話型ウィザード（表示専用）
// ==============================
// ここは質問の見せ方・ステップの表示切り替えだけを扱う。
// フォーム値の読み取り・検証・保存は従来どおり handleItemSubmit /
// getItemFromForm / validateItemForm が行い、ここからは触れない。

const ITEM_FORM_WIZARD_TOTAL_STEPS = 8;
let itemFormWizardStep = 1;
let itemFormWizardMode = "wizard";

function getWizardQuestionText(step) {
  const nameInput = document.querySelector("#nameInput");
  const enteredName = nameInput ? nameInput.value.trim() : "";
  const itemLabel = enteredName ? `「${enteredName}」` : "その品";
  const questions = {
    1: "ようこそだニャ、ご主人。今日はどんな品を評議会へ持ち込むのかニャ？",
    2: enteredName
      ? `ふむふむ、${itemLabel}だニャ。この品の市場情報、どうやって集めるかニャ？`
      : "この品の市場情報、どうやって集めるかニャ？",
    3: `それじゃあ、${itemLabel}がいま市場ではどんな売られ方をしているか教えてニャ。`,
    4: "次はお金の話だニャ。数字は正直に頼むニャ。審議の土台になるのだニャ。",
    5: `作戦会議だニャ。${itemLabel}、いくらで狙って、いくらまでなら許せるかニャ？`,
    6: "ここからは心のアクセルを測るニャ。見栄を張っても評議会は誤魔化せないニャ。",
    7: "今度は理性のブレーキだニャ。目を逸らしちゃダメだニャ。",
    8: "最後に言い残したことはあるかニャ？よければこのまま評議会へ提出するニャ！"
  };
  return questions[step] || questions[1];
}

function setupItemFormWizard() {
  const nextButton = document.querySelector("#wizardNextButton");
  if (!nextButton) return;

  nextButton.addEventListener("click", goToNextWizardStep);
  document.querySelector("#wizardBackButton").addEventListener("click", () => setItemFormWizardStep(itemFormWizardStep - 1));
  document.querySelector("#wizardModeToggleButton").addEventListener("click", toggleItemFormWizardMode);
  renderItemFormWizard();
}

function goToNextWizardStep() {
  if (!validateCurrentWizardStepDisplay()) return;
  setItemFormWizardStep(itemFormWizardStep + 1);
}

function setItemFormWizardStep(step) {
  itemFormWizardStep = clamp(step, 1, ITEM_FORM_WIZARD_TOTAL_STEPS);
  renderItemFormWizard();
}

// ブラウザ標準の入力チェック（required等）を現在ステップ内だけ先に見せる。
// 保存時の検証（validateItemForm）の代わりにはしない。
function validateCurrentWizardStepDisplay() {
  const currentStep = document.querySelector(`.wizard-step[data-wizard-step="${itemFormWizardStep}"]`);
  if (!currentStep) return true;

  const fields = currentStep.querySelectorAll("input, select, textarea");
  for (const field of fields) {
    if (!field.disabled && !field.checkValidity()) {
      field.reportValidity();
      return false;
    }
  }

  return true;
}

function toggleItemFormWizardMode() {
  itemFormWizardMode = itemFormWizardMode === "wizard" ? "all" : "wizard";
  renderItemFormWizard();
}

function resetItemFormWizardDisplay() {
  itemFormWizardStep = 1;
  renderItemFormWizard();
}

function showItemFormWizardAllMode() {
  itemFormWizardMode = "all";
  renderItemFormWizard();
}

function renderItemFormWizard() {
  const form = document.querySelector("#itemForm");
  const nav = document.querySelector("#wizardNav");
  if (!form || !nav) return;

  const isWizard = itemFormWizardMode === "wizard";
  const isLastStep = itemFormWizardStep >= ITEM_FORM_WIZARD_TOTAL_STEPS;
  const isMarketRouteStep = isWizard && itemFormWizardStep === 2;

  form.classList.toggle("wizard-mode", isWizard);
  form.querySelectorAll(".wizard-step").forEach((step) => {
    const stepNumber = Number(step.dataset.wizardStep);
    step.classList.toggle("wizard-step-hidden", isWizard && stepNumber !== itemFormWizardStep);
  });

  nav.classList.toggle("hidden", !isWizard);
  document.querySelector("#wizardBackButton").disabled = itemFormWizardStep <= 1;
  document.querySelector("#wizardNextButton").classList.toggle("hidden", isLastStep || isMarketRouteStep);
  document.querySelector("#itemFormActions").classList.toggle("hidden", isWizard && !isLastStep);
  document.querySelector("#wizardModeToggleButton").textContent = isWizard
    ? "一覧形式でまとめて入力する"
    : "対話形式（案内係）に戻る";
  document.querySelector("#wizardQuestionText").textContent = isWizard
    ? getWizardQuestionText(itemFormWizardStep)
    : "全項目を一覧表示中だニャ。まとめて記入して、評議会へ提出するニャ。";

  const progress = document.querySelector("#wizardProgress");
  progress.classList.toggle("hidden", !isWizard);

  if (isWizard) {
    progress.innerHTML = "";
    for (let step = 1; step <= ITEM_FORM_WIZARD_TOTAL_STEPS; step += 1) {
      const dot = document.createElement("span");
      const stateClass = step === itemFormWizardStep ? " current" : step < itemFormWizardStep ? " done" : "";
      dot.className = `wizard-progress-dot${stateClass}`;
      progress.appendChild(dot);
    }

    const label = document.createElement("strong");
    label.className = "wizard-progress-label";
    label.textContent = `Q${itemFormWizardStep} / ${ITEM_FORM_WIZARD_TOTAL_STEPS}`;
    progress.appendChild(label);
  }

  renderDraftMarketResearchUiState();
}

function getTabNameForItem(item) {
  if (item.purchased) return "purchased";
  if (item.skipped) return "skipped";
  return "considering";
}

function setScoreValue(inputId, value) {
  const input = document.querySelector(`#${inputId}`);
  input.value = value || DEFAULT_SCORE;
  input.nextElementSibling.textContent = input.value;
}

function chooseCouncilMode(defaultMode) {
  const selectedMode = getSelectableCouncilMode(defaultMode);
  const dialog = document.querySelector("#modeDialog");
  const options = document.querySelector("#modeDialogOptions");

  options.innerHTML = "";

  COUNCIL_MODES.forEach((mode) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `mode-option-button${mode === selectedMode ? " selected" : ""}`;
    button.textContent = mode;
    button.setAttribute("aria-pressed", mode === selectedMode ? "true" : "false");
    button.addEventListener("click", () => closeModeDialog(mode));
    options.appendChild(button);
  });

  dialog.classList.remove("hidden");

  return new Promise((resolve) => {
    dialog.dataset.resolveMode = "pending";
    dialog.resolveModeSelection = resolve;
  });
}

function closeModeDialog(selectedMode = "") {
  const dialog = document.querySelector("#modeDialog");
  const resolver = dialog.resolveModeSelection;

  dialog.classList.add("hidden");
  dialog.resolveModeSelection = null;
  dialog.dataset.resolveMode = "";

  if (typeof resolver === "function") {
    resolver(selectedMode);
  }
}

function handleModeDialogBackdropClick(event) {
  if (event.target.id === "modeDialog") {
  closeModeDialog();
  }
}

function showPurchasePresentation(item, verdict) {
  showJudgmentPresentation({
    presentationType: "purchase",
    itemName: item.name,
    councilMode: verdict.councilMode,
    judgment: verdict.judgment,
    judgmentComment: verdict.comment
  });
}

function showReviewPresentation(reviewResult) {
  showJudgmentPresentation({
    presentationType: "review",
    ...reviewResult
  });
}

function showJudgmentPresentation(presentationResult) {
  clearReviewPresentationTimers();

  const presentationType = presentationResult.presentationType || "review";
  const isPurchasePresentation = presentationType === "purchase";
  const filter = isPurchasePresentation ? { key: "all", label: "すべて" } : getReviewFilterForJudgment(presentationResult.judgment);
  const dialog = document.querySelector("#reviewPresentationDialog");
  const stage = document.querySelector("#reviewPresentationStage");
  const image = document.querySelector("#reviewPresentationImage");
  const fallback = document.querySelector("#reviewPresentationFallback");
  const resultBox = document.querySelector("#reviewPresentationResult");
  const actions = document.querySelector("#reviewPresentationActions");
  const skipButton = document.querySelector("#reviewPresentationSkipButton");
  const stageText = document.querySelector("#reviewPresentationStageText");
  const mode = getSelectableCouncilMode(presentationResult.councilMode);
  const presentation = getCouncilPresentationConfig(mode);
  const progressLines = getCouncilProgressLines(presentation);

  pendingReviewPresentation = {
    ...presentationResult,
    presentationType,
    filter,
    progressLines
  };

  document.querySelector("#reviewPresentationTitle").textContent = isPurchasePresentation ? "購入後判決" : presentationResult.itemName;
  document.querySelector("#reviewPresentationMode").textContent = mode;
  document.querySelector("#reviewPresentationFallbackMode").textContent = mode;
  stageText.textContent = progressLines[0];
  stageText.classList.remove("hidden");
  document.querySelector("#reviewPresentationJudgmentLabel").textContent = isPurchasePresentation ? "購入後判決" : "判決";
  document.querySelector("#reviewPresentationCommentLabel").textContent = isPurchasePresentation ? "購入後評議会のコメント" : "コメント";
  document.querySelector("#reviewPresentationJudgment").textContent = "";
  document.querySelector("#reviewPresentationComment").textContent = "";
  document.querySelector("#reviewPresentationMoveText").textContent = "";
  document.querySelector("#reviewPresentationFilterButton").textContent = `${filter.label}フィルターで見る`;
  document.querySelector("#reviewPresentationFilterButton").dataset.filter = filter.key;

  stage.className = `council-stage ${getCouncilModeEffectClass(presentation.effectPreset)}`;
  resultBox.classList.add("hidden");
  actions.classList.add("hidden");
  skipButton.classList.remove("hidden");
  fallback.classList.add("hidden");
  image.classList.remove("hidden");
  image.alt = `${mode}の8bit評議会`;
  if (presentation.image) {
    image.src = presentation.image;
  } else {
    image.removeAttribute("src");
    showReviewPresentationFallback();
  }

  dialog.classList.remove("hidden");

  progressLines.forEach((line, index) => {
    const at = REVIEW_PRESENTATION_PROGRESS_TIMES_MS[index];
    if (!at) return;

    reviewPresentationTimers.push(window.setTimeout(() => {
      stageText.textContent = line;
    }, at));
  });

  reviewPresentationTimers.push(window.setTimeout(() => {
    renderReviewPresentationResult();
  }, REVIEW_PRESENTATION_DURATION_MS));
}

function renderReviewPresentationResult() {
  if (!pendingReviewPresentation) {
    return;
  }

  const { judgment, judgmentComment, filter, presentationType } = pendingReviewPresentation;
  const isPurchasePresentation = presentationType === "purchase";
  const resultBox = document.querySelector("#reviewPresentationResult");
  const commentElement = document.querySelector("#reviewPresentationComment");
  const moveTextElement = document.querySelector("#reviewPresentationMoveText");
  const filterButton = document.querySelector("#reviewPresentationFilterButton");

  clearReviewPresentationTimers();
  document.querySelector("#reviewPresentationJudgment").textContent = judgment;
  commentElement.textContent = stripJudgmentHeadingLines(judgmentComment);
  moveTextElement.textContent = isPurchasePresentation
    ? "閉じると購入後評議会に戻ります。保存は「購入を確定して保存」を押した時だけ行われます。"
    : `この商品は「${filter.label}」フィルターへ移動しました。`;
  filterButton.classList.toggle("hidden", isPurchasePresentation);
  document.querySelector("#reviewPresentationStageText").classList.add("hidden");
  document.querySelector("#reviewPresentationSkipButton").classList.add("hidden");
  resultBox.classList.remove("hidden");
  document.querySelector("#reviewPresentationActions").classList.remove("hidden");
  resetReviewPresentationScroll();
}

function resetReviewPresentationScroll() {
  const resultBox = document.querySelector("#reviewPresentationResult");
  const commentElement = document.querySelector("#reviewPresentationComment");
  const dialog = document.querySelector(".review-presentation-dialog");

  const resetTargets = () => {
    [resultBox, commentElement, dialog].forEach((element) => {
      if (element) {
        element.scrollTop = 0;
      }
    });
  };

  resetTargets();

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(resetTargets);
    return;
  }

  window.setTimeout(resetTargets, 0);
}

function handleReviewPresentationFilterClick() {
  const filter = pendingReviewPresentation ? pendingReviewPresentation.filter.key : "all";
  closeReviewPresentation(filter);
}

function skipReviewPresentation() {
  renderReviewPresentationResult();
}

function handleReviewPresentationBackdropClick(event) {
  if (event.target.id === "reviewPresentationDialog") {
    closeReviewPresentation("all");
  }
}

function closeReviewPresentation(filterKey = "all") {
  const presentationType = pendingReviewPresentation ? pendingReviewPresentation.presentationType : "review";

  clearReviewPresentationTimers();
  document.querySelector("#reviewPresentationDialog").classList.add("hidden");
  pendingReviewPresentation = null;
  document.querySelector("#reviewPresentationFilterButton").classList.remove("hidden");

  if (presentationType === "purchase") {
    revealPurchaseSaveAction();
    return;
  }

  activeTab = "considering";
  consideringFilter = CONSIDERING_FILTERS.some((filter) => filter.key === filterKey) ? filterKey : "all";
  renderAll();
}

function revealPurchaseSaveAction() {
  const notice = document.querySelector("#purchaseUnsavedNotice");
  const confirmButton = document.querySelector("#purchaseConfirmButton");
  if (notice) {
    notice.classList.remove("hidden");
  }
  if (!confirmButton || confirmButton.classList.contains("hidden")) {
    return;
  }

  const scrollTarget = confirmButton.closest(".form-actions") || confirmButton;
  const reveal = () => {
    scrollTarget.scrollIntoView({ behavior: "smooth", block: "center" });
    confirmButton.classList.add("save-action-highlight");
    window.setTimeout(() => {
      confirmButton.classList.remove("save-action-highlight");
    }, 1800);
    if (typeof confirmButton.focus === "function") {
      try {
        confirmButton.focus({ preventScroll: true });
      } catch (error) {
        confirmButton.focus();
      }
    }
  };

  if (typeof window.requestAnimationFrame === "function") {
    window.requestAnimationFrame(reveal);
    return;
  }

  window.setTimeout(reveal, 0);
}

function clearReviewPresentationTimers() {
  reviewPresentationTimers.forEach((timerId) => window.clearTimeout(timerId));
  reviewPresentationTimers = [];
}

function showReviewPresentationFallback() {
  document.querySelector("#reviewPresentationImage").classList.add("hidden");
  document.querySelector("#reviewPresentationFallback").classList.remove("hidden");
}

function getCouncilPresentationConfig(mode) {
  const assets = typeof PRESENTATION_ASSETS === "object" && PRESENTATION_ASSETS ? PRESENTATION_ASSETS : {};
  const modes = assets.councilModes || {};

  return modes[mode] || modes[FALLBACK_COUNCIL_MODE] || {
    image: "",
    effectPreset: "normal",
    progressLines: ["評議会、開廷……", "評議中……", "購入申請を審査中……", "判決が出ました"]
  };
}

function getCouncilProgressLines(presentation) {
  if (Array.isArray(presentation.progressLines) && presentation.progressLines.length > 0) {
    return presentation.progressLines;
  }

  return ["評議会、開廷……", "評議中……", "購入申請を審査中……", "判決が出ました"];
}

function getCouncilModeEffectClass(effectPreset) {
  return COUNCIL_EFFECT_CLASSES[effectPreset] || COUNCIL_EFFECT_CLASSES.normal;
}

function getReviewFilterForJudgment(judgment) {
  if (judgment === "買い") return { key: "buy", label: "買い" };
  if (judgment === "保留") return { key: "hold", label: "保留" };
  if (judgment === "見送り") return { key: "skipJudgment", label: "見送り判定" };
  if (judgment === "危険な買い") return { key: "danger", label: "危険な買い" };
  return { key: "all", label: "すべて" };
}

function getPreferredCouncilMode(item) {
  if (COUNCIL_MODES.includes(item.councilMode)) {
    return item.councilMode;
  }

  if (COUNCIL_MODES.includes(settings.defaultCouncilMode)) {
    return settings.defaultCouncilMode;
  }

  return FALLBACK_COUNCIL_MODE;
}

function getSelectableCouncilMode(mode) {
  return COUNCIL_MODES.includes(mode) ? mode : FALLBACK_COUNCIL_MODE;
}

function getSelectableItemType(itemType) {
  return ITEM_TYPE_OPTIONS.includes(itemType) ? itemType : DEFAULT_ITEM_TYPE;
}

function getDisplayItemType(itemType) {
  return ITEM_TYPE_OPTIONS.includes(itemType) ? itemType : "不明";
}

function getSelectablePriceBasisType(priceBasisType) {
  return PRICE_BASIS_TYPES.includes(priceBasisType) ? priceBasisType : DEFAULT_PRICE_BASIS_TYPE;
}

function getDisplayPriceBasisType(priceBasisType) {
  return PRICE_BASIS_TYPES.includes(priceBasisType) ? priceBasisType : UNKNOWN_PRICE_BASIS_TYPE;
}

function handleCategoryChange() {
  updateLegoReleaseDateField();
  applyLegoRarityRiskIfNeeded();
}

function handlePriceBasisChange() {
  updatePriceBasisField();
  renderFormPriceStatus();
}

function handleRegisteredPriceInput() {
  syncCurrentPriceOnNewItem();
  renderFormPriceStatus();
}

function syncCurrentPriceOnNewItem() {
  if (document.querySelector("#editingItemId").value) {
    return;
  }

  document.querySelector("#currentPriceInput").value = document.querySelector("#registeredPriceInput").value;
}

function updateCurrentPriceField() {
  const isEditing = Boolean(document.querySelector("#editingItemId").value);
  const currentPriceInput = document.querySelector("#currentPriceInput");
  const currentPriceLabel = document.querySelector("#currentPriceLabel");
  const currentPriceHelp = document.querySelector("#currentPriceHelp");

  currentPriceInput.disabled = !isEditing;
  currentPriceLabel.textContent = isEditing ? "現在価格" : "現在価格（登録時は自動入力）";
  currentPriceHelp.textContent = isEditing
    ? "価格が変わった場合だけ更新してください。"
    : "新規登録時は登録時価格と同じ値で保存します。";

  if (!isEditing) {
    syncCurrentPriceOnNewItem();
  }
}

function updatePriceBasisField() {
  const priceBasisType = getSelectablePriceBasisType(document.querySelector("#priceBasisTypeInput").value);
  const listPriceInput = document.querySelector("#listPriceInput");
  const listPriceLabel = document.querySelector("#listPriceLabel");
  const listPriceHelp = document.querySelector("#listPriceHelp");
  const listPriceField = document.querySelector("#listPriceField");
  const isUnknown = priceBasisType === UNKNOWN_PRICE_BASIS_TYPE;

  const labels = {
    "定価を基準にする": "基準価格（定価）",
    "中古相場を基準にする": "基準価格（中古相場）",
    "参考相場を基準にする": "基準価格（参考相場）"
  };
  const helps = {
    "定価を基準にする": "メーカー定価・希望小売価格など、比較の土台になる価格です。",
    "中古相場を基準にする": "中古品や廃盤品など、比較したい中古相場を入力します。",
    "参考相場を基準にする": "オープン価格や海外品など、目安にしたい参考相場を入力します。",
    "基準価格なし・不明": "基準価格がない場合は入力不要です。保存時は0円として扱います。"
  };

  listPriceLabel.textContent = labels[priceBasisType] || "基準価格";
  listPriceHelp.textContent = helps[priceBasisType] || "";
  listPriceInput.disabled = isUnknown;
  listPriceInput.required = !isUnknown;
  listPriceField.classList.toggle("field-muted", isUnknown);

  if (isUnknown) {
    listPriceInput.value = "";
  }
}

function renderFormPriceStatus() {
  const preview = document.querySelector("#priceStatusPreview");
  if (!preview) return;

  const editingItemId = document.querySelector("#editingItemId").value;
  const priceBasisType = getSelectablePriceBasisType(document.querySelector("#priceBasisTypeInput").value);
  const item = {
    priceBasisType,
    listPrice: priceBasisType === UNKNOWN_PRICE_BASIS_TYPE ? 0 : toNumber(document.querySelector("#listPriceInput").value),
    currentPrice: editingItemId
      ? toNumber(document.querySelector("#currentPriceInput").value)
      : toNumber(document.querySelector("#registeredPriceInput").value)
  };
  const status = calculatePriceStatus(item);

  preview.innerHTML = `
    <span>価格状態</span>
    <strong>${escapeHtml(status.label)}</strong>
    <small>${escapeHtml(status.detail)}</small>
  `;
}

function updateLegoReleaseDateField() {
  const isLego = isLegoCategory(document.querySelector("#categoryInput").value);
  const field = document.querySelector("#legoReleaseDateField");
  const input = document.querySelector("#releaseDateInput");

  field.classList.toggle("hidden", !isLego);
  input.disabled = !isLego;

  if (!isLego) {
    input.value = "";
    document.querySelector("#rarityRiskScoreInput").dataset.manualOverride = "false";
  }
}

function applyLegoRarityRiskIfNeeded() {
  const category = document.querySelector("#categoryInput").value;
  const releaseDate = document.querySelector("#releaseDateInput").value;
  const rarityInput = document.querySelector("#rarityRiskScoreInput");

  if (!isLegoCategory(category) || rarityInput.dataset.manualOverride === "true") {
    return;
  }

  const autoRisk = calculateLegoRarityRisk(releaseDate);
  if (!autoRisk) {
    return;
  }

  setScoreValue("rarityRiskScoreInput", autoRisk.score);
}

function markRarityRiskManualOverride() {
  if (!isLegoCategory(document.querySelector("#categoryInput").value)) {
    return;
  }

  document.querySelector("#rarityRiskScoreInput").dataset.manualOverride = "true";
}

function isLegoCategory(category) {
  return category.trim().toUpperCase() === LEGO_CATEGORY_NAME;
}

function getLegoRiskText(item) {
  if (!isLegoCategory(item.category) || !item.releaseDate) {
    return "";
  }

  const autoRisk = calculateLegoRarityRisk(item.releaseDate);
  if (!autoRisk) {
    return "";
  }

  const overrideText = item.rarityRiskManualOverride ? " / 手動上書き中" : "";
  return `LEGOざっくり廃盤警戒値：${autoRisk.level}（発売から約${autoRisk.elapsedMonths}か月${overrideText}）`;
}

function getPurchaseDifferenceText(item) {
  if (!item.purchased) return "";

  const difference = toNumber(item.purchasePrice) - toNumber(item.registeredPrice);
  if (difference < 0) {
    return `登録時価格より${formatYen(Math.abs(difference))}安く購入しました。評議会はこれを「理性ある勝利」と認定します。`;
  }

  if (difference > 0) {
    return `登録時価格より${formatYen(difference)}高く購入しています。これは待った結果ではなく、判断の遅延による損耗です。`;
  }

  return "登録時価格と同額で購入しました。評議会は静かにうなずいています。";
}

function getJudgmentClass(judgment) {
  if (judgment === "買い") return "judgment-buy";
  if (judgment === "保留") return "judgment-hold";
  if (judgment === "見送り") return "judgment-skip";
  if (judgment === "危険な買い") return "judgment-danger";
  return "";
}

function getDisplayStatus(item) {
  if (item.purchased) {
    return {
      label: "購入済み",
      className: "status-purchased"
    };
  }

  if (item.skipped) {
    return {
      label: "見送り済み",
      className: "status-skipped"
    };
  }

  if (item.judgment) {
    return {
      label: item.judgment,
      className: getJudgmentClass(item.judgment)
    };
  }

  return {
    label: "検討中",
    className: "status-considering"
  };
}

function getActionStatusForItem(item) {
  if (item.purchased) return "購入済み";
  if (item.skipped) return "見送り済み";
  return "検討中";
}

function setText(selector, text) {
  document.querySelector(selector).textContent = text;
}

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function clampScore(value) {
  return clamp(toNumber(value), 1, 10);
}

function formatYen(value) {
  return `${toNumber(value).toLocaleString("ja-JP")}円`;
}

function formatDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatBackupFileTimestamp(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${year}-${month}-${day}-${hour}${minute}`;
}

function parseDateOnly(value) {
  if (!value) return null;

  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function getAutoBudgetEndDate(startDateValue) {
  const startDate = parseDateOnly(startDateValue);
  if (!startDate) return "";

  const endDate = new Date(startDate);
  endDate.setMonth(endDate.getMonth() + 1);
  endDate.setDate(endDate.getDate() - 1);

  return formatDateInputValue(endDate);
}

function isValidBudgetPeriod(startDateValue, endDateValue) {
  const startDate = parseDateOnly(startDateValue);
  const endDate = parseDateOnly(endDateValue);

  if (!startDate || !endDate) {
    return false;
  }

  return endDate >= startDate;
}

function formatDisplayDate(value) {
  if (!value) return "-";

  const date = parseDateOnly(value);
  if (!date) return value;

  return date.toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function generateId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `item-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

loadData();
setupEvents();
setupItemFormWizard();
renderAll();
