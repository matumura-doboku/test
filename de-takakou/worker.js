export default {
    async fetch(request, env) {
        // 1. CORSヘッダーの準備
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*", // 特定のドメインに絞るのがベストですが、開発用なら * でOK
            "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, apikey", // apikeyヘッダーを許可
        };

        // 2. OPTIONSリクエスト（プリフライト）への対応
        if (request.method === "OPTIONS") {
            return new Response(null, {
                headers: corsHeaders,
            });
        }

        const url = new URL(request.url);

        // 3. ターゲットAPIの構築 (パスパラメータ等から転送先を決定)
        // エンドポイント例: https://your-worker.workers.dev/api/v1/search?prefCode=34
        // ここでは国交省データプラットフォームをターゲットとする
        const targetBase = "https://www.mlit-data.go.jp";
        const targetUrl = targetBase + url.pathname + url.search;

        try {
            // 4. リクエストの転送
            // 元のリクエストのヘッダーを複製（APIキーなどを含む）
            const newRequest = new Request(targetUrl, {
                method: request.method,
                headers: request.headers,
            });

            const response = await fetch(newRequest);

            // 5. レスポンスの返却（CORSヘッダーを付与して返す）
            const newResponse = new Response(response.body, response);
            Object.keys(corsHeaders).forEach((key) => {
                newResponse.headers.set(key, corsHeaders[key]);
            });

            return newResponse;

        } catch (e) {
            return new Response(JSON.stringify({ error: e.message }), {
                status: 500,
                headers: {
                    ...corsHeaders,
                    "Content-Type": "application/json"
                },
            });
        }
    },
};
