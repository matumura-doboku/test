export default {
    async fetch(request, env, ctx) {
        // 1. CORSヘッダー
        const corsHeaders = {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type, apikey",
        };

        // 2. OPTIONS対応
        if (request.method === "OPTIONS") {
            return new Response(null, { headers: corsHeaders });
        }

        const url = new URL(request.url);

        // 3. ターゲットAPIの設定
        // 仕様書等のサンプルに基づき .go 無しのドメインを指定
        const targetHost = "https://www.mlit-data.jp";
        const targetUrl = targetHost + url.pathname + url.search;

        try {
            // 4. リクエストの転送
            const newRequest = new Request(targetUrl, {
                method: request.method,
                headers: request.headers,
                body: request.body // POST等のbodyも転送
            });

            const response = await fetch(newRequest);

            // 5. レスポンスの返却
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
