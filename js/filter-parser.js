
let FIELD_LABELS = {};

export function registerLabels(labels) {
    Object.assign(FIELD_LABELS, labels);
    LABEL_TO_KEY_MAP = null; // キャッシュクリア
}

/**
 * 日本語ラベルから内部キーを逆引きするためのマップ
 * 例: {'判定区分': 'meta_RSDB:tenken_kiroku_hantei_kubun', ...}
 */
let LABEL_TO_KEY_MAP = null;

function initLabelMap() {
    if (LABEL_TO_KEY_MAP) return;
    LABEL_TO_KEY_MAP = {};
    Object.entries(FIELD_LABELS).forEach(([key, label]) => {
        LABEL_TO_KEY_MAP[label] = key;
    });
}

/**
 * 日本語ラベルまたはキーを受け取り、内部キーを返す
 * @param {string} input - ユーザー入力（日本語ラベルまたはキー）
 * @returns {string} 内部キー
 */
function resolveKey(input) {
    if (!LABEL_TO_KEY_MAP) initLabelMap();
    if (FIELD_LABELS[input]) return input; // すでにキーの場合はそのまま
    return LABEL_TO_KEY_MAP[input] || input; // ラベルから変換、なければそのまま
}

/**
 * 単一の条件式をパースする
 * 対応形式: "キー 演算子 値", "値 演算子 キー"
 * @param {string} condition - "判定区分 >= 3" などの文字列
 * @returns {Array|null} MapLibre用フィルタ配列、またはnull
 */
function parseSingleCondition(condition) {
    // 対応演算子: >=, <=, >, <, =, !=, <>, ==
    // 長い順に並べてマッチさせる
    const operatorRegex = /(>=|<=|==|!=|<>|>|<|=)/;
    const match = condition.match(operatorRegex);

    if (!match) return null;

    const operatorStr = match[0];
    const parts = condition.split(operatorStr);
    if (parts.length !== 2) return null;

    let left = parts[0].trim();
    let right = parts[1].trim();
    let op = operatorStr;

    // 演算子の正規化
    if (op === '=' || op === '==') op = '==';
    else if (op === '!=' || op === '<>') op = '!=';

    // どちらがキーでどちらが値かを判定する
    // 戦略: resolveKeyで変換できたほうをキーとする。両方変換できなければ左をキーとみなす。
    let key = resolveKey(left);
    let valueStr = right;
    let isLeftKey = true;

    // 左辺がキーとして特定できず、右辺が特定できる場合は入れ替える
    if (key === left && resolveKey(right) !== right) {
        key = resolveKey(right);
        valueStr = left;
        isLeftKey = false;

        // 左右を入れ替えたので演算子も反転させる必要がある
        if (op === '>') op = '<';
        else if (op === '<') op = '>';
        else if (op === '>=') op = '<=';
        else if (op === '<=') op = '>=';
    } else {
        key = resolveKey(left);
    }

    // 値の型変換 (数値か文字列か)
    let value = parseFloat(valueStr);
    if (isNaN(value)) {
        // 数値でない場合は文字列として扱う（クォートがあれば外す）
        value = valueStr.replace(/^['"]|['"]$/g, '');
    }

    // MapLibreフィルタの構築
    // 数値比較の場合は to-number キャストを入れると安全
    // 文字列比較の場合はそのまま
    if (typeof value === 'number') {
        return [op, ['to-number', ['get', key]], value];
    } else {
        return [op, ['get', key], value];
    }
}

/**
 * 関数スタイル AND(...) / OR(...) をパースする
 * @param {string} input - "AND(条件1, 条件2, ...)" など
 * @returns {Array|null} MapLibre用フィルタ配列
 */
function parseFunctionStyle(input) {
    const trimmed = input.trim();

    // AND(...) または OR(...) のパターンをチェック
    const funcMatch = trimmed.match(/^(AND|OR)\s*\((.+)\)$/i);
    if (!funcMatch) return null;

    const funcName = funcMatch[1].toUpperCase();
    const argsStr = funcMatch[2];

    // カンマで分割（ただし括弧内のカンマは無視）
    const args = splitByComma(argsStr);

    const operator = funcName === 'AND' ? 'all' : 'any';
    const result = [operator];

    for (const arg of args) {
        const trimmedArg = arg.trim();
        if (!trimmedArg) continue;

        // 再帰的にパース（ネストされたAND/ORにも対応）
        const nested = parseFunctionStyle(trimmedArg);
        if (nested) {
            result.push(nested);
        } else {
            // 単一条件としてパース
            const condition = parseSingleCondition(trimmedArg);
            if (condition) {
                result.push(condition);
            }
        }
    }

    if (result.length === 1) return null; // 条件なし
    if (result.length === 2) return result[1]; // 単一条件
    return result;
}

/**
 * 括弧のネストを考慮してカンマで分割
 */
function splitByComma(str) {
    const result = [];
    let current = '';
    let depth = 0;

    for (const char of str) {
        if (char === '(') {
            depth++;
            current += char;
        } else if (char === ')') {
            depth--;
            current += char;
        } else if (char === ',' && depth === 0) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    if (current) {
        result.push(current);
    }

    return result;
}

/**
 * 複合条件式（AND/OR）をパースする
 * 対応形式:
 * - インフィックス: "条件1 AND 条件2 OR 条件3"
 * - 関数スタイル: "AND(条件1, 条件2, 条件3)" または "OR(AND(a, b), c)"
 * @param {string} input - ユーザー入力全体
 * @returns {Array|null} MapLibre用フィルタ配列
 */
export function parseFilterExpression(input) {
    if (!input || !input.trim()) return null;

    initLabelMap();

    const trimmed = input.trim();

    // まず関数スタイル AND(...) / OR(...) を試す
    const funcResult = parseFunctionStyle(trimmed);
    if (funcResult) return funcResult;

    // 従来のインフィックススタイル (A AND B OR C) をパース
    // 1. OR で分割 (OR または ||, 大文字小文字同一視)
    const orGroups = trimmed.split(/ OR | \|\| /i);

    const anyFilter = ['any'];

    for (const group of orGroups) {
        // 2. AND で分割 (AND または &&)
        const andParts = group.split(/ AND | && /i);
        const allFilter = ['all'];

        for (const part of andParts) {
            const partTrimmed = part.trim();
            if (!partTrimmed) continue;

            const condition = parseSingleCondition(partTrimmed);
            if (condition) {
                allFilter.push(condition);
            }
        }

        // AND条件が有効な場合のみ追加
        if (allFilter.length > 1) { // 'all' だけの配列は長さ1
            // 要素が1つだけなら 'all' で包む必要はないが、統一のため包んでおくか、最適化するか
            if (allFilter.length === 2) {
                anyFilter.push(allFilter[1]);
            } else {
                anyFilter.push(allFilter);
            }
        }
    }

    if (anyFilter.length === 1) return null; // 条件なし
    if (anyFilter.length === 2) return anyFilter[1]; // ORなし、単一条件のみ

    return anyFilter;
}
