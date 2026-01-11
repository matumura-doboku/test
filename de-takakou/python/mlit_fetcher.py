import json
import asyncio
from pyodide.http import pyfetch

class MLITDataFetcher:
    """
    国土交通省データプラットフォームからデータを取得するためのクラス (Pyodide版)
    References: https://www.mlit-data.jp/api_docs/
    """
    # Cloudflare Workerなどのプロキシを経由する場合はここを変更してください
    # 直接アクセスはCORS制限に引っかかる可能性があります
    API_ENDPOINT = "https://www.mlit-data.jp/api/v1/"
    
    def __init__(self, api_key):
        self.api_key = api_key
        if not self.api_key:
            print("Warning: API Key is not provided.")

    def get_headers(self):
        return {
            "Content-Type": "application/json",
            "apikey": self.api_key
        }

    async def execute_query(self, query, variables=None):
        payload = {"query": query}
        if variables:
            payload["variables"] = variables
        
        body_str = json.dumps(payload)

        try:
            # requests.post -> pyfetch
            response = await pyfetch(
                self.API_ENDPOINT,
                method="POST",
                headers=self.get_headers(),
                body=body_str
            )
            
            if response.status != 200:
                print(f"HTTP Error: {response.status}")
                return None
                
            return await response.json()
        except Exception as e:
            print(f"Fetch Error: {e}")
            return None

    async def search_datasets(self, term, limit=10, offset=0, prefecture=None):
        """
        キーワードでデータセットを検索する
        prefecture: 都道府県名 (例: "東京都") でフィルタリングする場合に指定
        """
        query = """
        query SearchDatasets($term: String, $first: Int, $offset: Int, $attrFilter: AttributeFilter) {
            search(term: $term, first: $first, offset: $offset, attributeFilter: $attrFilter) {
                totalNumber
                searchResults {
                    id
                    title
                    description
                    publisher {
                        name
                    }
                    metadata
                }
            }
        }
        """
        variables = {
            "term": term,
            "first": limit,
            "offset": offset
        }

        if prefecture:
            variables["attrFilter"] = {
                "attributeName": "DPF:prefecture_name",
                "is": prefecture
            }

        return await self.execute_query(query, variables)

    async def get_dataset_distributions(self, dataset_id):
        """
        データセット内のファイル(Distribution)一覧を取得する
        """
        query = """
        query GetDataCatalog($id: String!) {
            get_data_catalog(id: $id) {
                id
                title
                distributions {
                    id
                    title
                    format
                    accessURL
                    description
                }
            }
        }
        """
        variables = {"id": dataset_id}
        result = await self.execute_query(query, variables)
        if result and "data" in result and "get_data_catalog" in result["data"]:
            return result["data"]["get_data_catalog"]
        return None

    async def get_file_download_url(self, file_id):
        """
        ファイルIDからダウンロードURLを取得する
        """
        query = """
        query GetFileDownloadUrl($fileId: String!) {
            get_file_download_urls(file_id: $fileId) {
                file_id
                url
                expiration
            }
        }
        """
        variables = {"fileId": file_id}
        result = await self.execute_query(query, variables)
        if result and "data" in result and "get_file_download_urls" in result["data"]:
            data = result["data"]["get_file_download_urls"]
            if isinstance(data, list) and len(data) > 0:
                return data[0].get("url")
            elif isinstance(data, dict):
                return data.get("url")
        return None

    # Pyodide環境ではファイルシステムへの保存の挙動が異なるため、
    # データをオブジェクトとして返すか、仮想ファイルシステムに書き込む形式にします
    async def fetch_file_content(self, url):
        """
        URLからファイルの内容（バイナリ）を取得して返す
        """
        try:
            response = await pyfetch(url, method="GET")
            if response.status != 200:
                print(f"Download Error: {response.status}")
                return None
            buffer = await response.buffer()
            return buffer
        except Exception as e:
            print(f"Download Exception: {e}")
            return None

# 使用例の関数 (awaitが必要なため、トップレベルでは実行できません)
async def main_test(api_key):
    fetcher = MLITDataFetcher(api_key)
    
    print("Searching '道路'...")
    res = await fetcher.search_datasets("道路", limit=2)
    
    if res:
        print(f"Result: {json.dumps(res)[:200]}...") # 先頭だけ表示

