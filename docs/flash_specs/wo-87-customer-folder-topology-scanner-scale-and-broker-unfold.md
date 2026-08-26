# WO-87 存量客户案卷拓扑扫描规模化容错与多 Broker 穿透适配

> **状态**：🚀 施工单（方案推演与终审就绪）
> **目标**：
> 1. **彻底修复根目录类型误判**：
>    - 修正 `_is_case_dir` 仅依赖数字序号导致客户文件夹被误判为案卷的致命 Bug；
>    - 建立基于子层级深度与业务关键词（Purchase / Refinance / Lender 机构）的精准区分模型，保证数百位存量客户 100% 正确判定为「多客户大根目录」；
> 2. **支持其他 Broker 汇聚目录穿透展开（如 `0. Lily S - Clients`）**：
>    - 智能识别 `* - Clients`、`* Client` 等团队 Broker 汇聚夹；
>    - 自动向下穿透一层提取该 Broker 名下的所有实际客户，并自动为案卷绑定 `broker_name`（如 `"Lily S"`）；
> 3. **客户姓名清洗与序号脱壳**：
>    - 自动剥离 `1. Indrit & Lin CUI` 前缀序号，提取纯净借款人姓名 `Indrit`、联名借款人 `Lin CUI` 与推荐人渠道；
> 4. **高性能秒级响应与多重容错保护**：
>    - 单个文件夹遍历异常局部隔离（try-catch），保证 700+ 大规模文件夹在 1 秒内平滑完成扫描并返回结构化数据。

---

## 一、涉及文件清单

| 文件路径 | 变更类型 | 说明 |
| :--- | :---: | :--- |
| `core/case_folder/topology.py` | MODIFY | 核心重构：根目录判定算法、Broker 穿透展开、客户序号清洗、Case 业务特征解耦 |
| `server/api/cases.py` | MODIFY | 强化 `/folder-topology/scan` 接口顶级全局容错与异常包装 |
| `frontend/src/components/cases/FolderTopologyScanner.tsx` | MODIFY | 界面展示支持显示所属 Broker 标签与更清晰的分类统计 |

---

## 二、详细技术实施方案

### 1. `core/case_folder/topology.py` 核心重构
* **客户名称清洗脱壳**：
  ```python
  def _parse_client_folder_name(name: str) -> dict[str, Any]:
      raw = name.strip()
      # 1. 脱掉开头的数字序号（如 "1. ", "17. "）
      raw = re.sub(r"^\s*\d+[\.\s、_-]+", "", raw).strip()
      # 2. 提取推荐人（如 "- Asik 推荐"）
      # 3. 拆解联名借款人（如 "&", "and", "+"）
  ```
* **Case 案卷子目录精准识别（解耦数字判定）**：
  * 案卷判定不再单纯匹配 `^\d+`；
  * 必须包含业务方案动词（`Purchase`, `Refinance`, `Refi`, `Cash out`, `Pre approval`, `Commercial`, `Construction` 等）或已知银行/机构名（`CBA`, `ANZ`, `Westpac`, `ORDE`, `NAB` 等），或者包含抵押物地址特征。
* **Broker 目录穿透展开机制**：
  ```python
  def _is_broker_folder(name: str) -> bool:
      lower = name.lower()
      return bool(re.search(r"[-_\s]clients?\b|client\b", lower)) or ("lily" in lower and "client" in lower)
  ```
  遇到 Broker 文件夹时，将其子目录作为该 Broker 名下的客户主体，自动设置 `broker_name = broker_clean_name`。
* **根目录智能判断**：
  * 若目录下的子文件夹内依然包含子文件夹（或大量客户特征目录），直接判定为 `is_root_multi_client = True`。

---

## 三、验收标准

1. **根目录识别 100% 正确**：选择近 700 个客户的总文件夹，系统准确返回 `is_root_multi_client: true`，且客户数统计正确；
2. **Broker 穿透生效**：`0. Lily S - Clients` 名下的客户被平铺展开，并标明 `所属 Broker: Lily S`；
3. **客户名纯净无序号**：`1. Indrit & Lin CUI` 识别为客户 `Indrit`、联名 `Lin CUI`，不再带有 `1.` 序号；
4. **性能与稳定性**：扫描在 1 秒内完成，无 500/422 报错；`tsc`、`vite build`、`pytest` 全绿。
