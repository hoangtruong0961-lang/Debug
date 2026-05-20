
import { toast } from 'sonner';

export interface LsrTableDefinition {
    id: string;
    name: string;
    columns: string[];
}

export const LsrParser = {
    /**
     * Parses the static structure of LSR tables from the configuration.
     * Return default table definitions since relying entirely on external presets
     * might leave the UI empty if not provided.
     */
    parseDefinitions(): LsrTableDefinition[] {
        const tables: LsrTableDefinition[] = [
            { id: "0", name: "Thông tin Hiện tại", columns: ["Thời gian", "Địa điểm", "Sự kiện", "Mục tiêu"] },
            { id: "1", name: "Nhân vật Gần đây", columns: ["Tên Nhân vật", "Thái độ/Trạng thái", "Hành động"] },
            { id: "2", name: "Trạng thái Bản thân", columns: ["Chỉ số/Tên", "Giá trị", "Mô tả"] },
            { id: "3", name: "Quan hệ (Relationships)", columns: ["Tên Nhân vật", "Độ thân thiết", "Chi tiết/Đánh giá"] },
            { id: "4", name: "Nhiệm vụ / Quest", columns: ["Thời gian", "Trạng thái", "Tên Quest", "Tiến độ"] },
            { id: "5", name: "Kỹ năng / Phép thuật", columns: ["Tên kỹ năng", "Cấp độ", "Sức mạnh / Mô tả"] },
            { id: "6", name: "Túi đồ (Inventory)", columns: ["Tên vật phẩm", "Số lượng", "Trạng thái/Tác dụng"] },
            { id: "7", name: "Trang bị đang mặc", columns: ["Vị trí", "Tên trang bị", "Hiệu ứng/Độ bền"] },
            { id: "8", name: "Địa điểm đã biết", columns: ["Tên Địa điểm", "Mô tả / Tiến độ khám phá"] },
            { id: "9", name: "Phe phái / Thế lực", columns: ["Tên phe phái", "Danh tiếng", "Trạng thái ngoại giao"] },
            { id: "10", name: "Timeline Sự kiện Thế giới", columns: ["Thời gian", "Ý nghĩa", "Tên sự kiện", "Chi tiết"] },
            { id: "11", name: "Tin đồn / Nhật ký", columns: ["Nguồn", "Nội dung", "Độ tin cậy"] },
            { id: "12", name: "Hiệu ứng (Buff/Debuff)", columns: ["Tên hiệu ứng", "Thời gian còn lại", "Tác dụng"] },
            { id: "13", name: "Kinh tế / Tiền tệ", columns: ["Loại tài sản", "Số lượng", "Ghi chú"] },
            { id: "14", name: "Pet / Đồng hành", columns: ["Tên", "Trạng thái", "Lòng trung thành / Vai trò"] },
            { id: "15", name: "Timeline Nhân Vật Chính", columns: ["ARC (Giai đoạn)", "Thời điểm (Ngày/Tháng/Năm)", "Tên Nhân vật - Tuổi", "Sự kiện"] }
        ];
        
        return tables;
    },

    /**
     * Parses the runtime output from AI (Text-based LSR format).
     * Format:
     * <table_stored>
     * #0 Thông tin Hiện tại|0:Năm Thương Lan 3025|1:Hang đá
     * #1 Nhân vật Gần đây|0:Lộ Na|1:0|2:Ăn uống
     * </table_stored>
     * 
     * Returns a map of TableID -> Array of Rows (objects)
     */
    parseLsrString(rawString: string): Record<string, Record<string, string>[]> {
        const result: Record<string, Record<string, string>[]> = {};
        
        if (!rawString) return result;

        // Clean up common AI artifacts that might be inside the tag
        const cleanString = rawString
            .replace(/```lsr/g, '')
            .replace(/```/g, '')
            .trim();

        // --- PHƯƠNG ÁN 1: ĐỊNH DẠNG LSR CHUẨN (#ID Name|0:Val...) ---
        // Sử dụng regex để tìm tất cả các khối bắt đầu bằng #ID
        // Pattern: #(\d+) theo sau là bất kỳ thứ gì cho đến khi gặp # tiếp theo hoặc hết chuỗi
        const tableBlocks = cleanString.split(/(?=#\d+)/);
        
        let hasAnyData = false;

        tableBlocks.forEach(block => {
            const trimmedBlock = block.trim();
            if (!trimmedBlock.startsWith('#')) return;

            // Tìm Table ID: #(\d+)
            const idMatch = trimmedBlock.match(/^#(\d+)/);
            if (!idMatch) return;

            const tableId = idMatch[1];
            
            // Tìm tất cả các cặp Index:Value trong block này
            // Pattern: (\d+)\s*:\s*([^|\n]+)
            // Chúng ta tìm các cặp số:giá trị, dừng lại khi gặp | hoặc xuống dòng
            const rowObj: Record<string, string> = {};
            
            // Regex tìm các cặp 0:Giá trị, 1:Giá trị...
            // Hỗ trợ cả trường hợp có khoảng trắng: "0 : Giá trị"
            const colRegex = /(\d+)\s*:\s*([^|\n]+)/g;
            let colMatch;
            
            while ((colMatch = colRegex.exec(trimmedBlock)) !== null) {
                const colIdx = colMatch[1];
                const colVal = colMatch[2].trim();
                rowObj[colIdx] = colVal;
            }

            if (Object.keys(rowObj).length > 0) {
                if (!result[tableId]) result[tableId] = [];
                
                // Kiểm tra xem dòng này đã tồn tại chưa (dựa trên cột 0 - ID/Tên)
                // Trong parseLsrString, ta thường giả định mỗi block #ID là một dòng
                // Nếu AI output nhiều block cùng ID, ta thêm vào mảng
                result[tableId].push(rowObj);
                hasAnyData = true;
            }
        });

        // Giới hạn 10 dòng cho bảng "Thông tin Hiện tại" (ID #0)
        if (result["0"] && result["0"].length > 10) {
            result["0"] = result["0"].slice(-10);
        }

        if (hasAnyData) return result;

        // --- PHƯƠNG ÁN 2: DỰ PHÒNG BẢNG MARKDOWN (NẾU AI QUÊN ĐỊNH DẠNG) ---
        const lines = cleanString.split('\n');
        const markdownRows = lines.filter(l => l.trim().startsWith('|') && l.trim().endsWith('|'));
        if (markdownRows.length >= 3) {
            console.warn("LsrParser: Phát hiện bảng Markdown thay vì định dạng LSR chuẩn.");
        }

        return result;
    },

    /**
     * Converts the runtime data map back to the text-based LSR format for AI consumption.
     */
    stringifyLsrData(data: Record<string, Record<string, string>[]>, tables: LsrTableDefinition[]): string {
        let result = "";
        
        tables.forEach(table => {
            const rows = data[table.id] || [];
            if (rows.length === 0) return;

            rows.forEach(row => {
                // Format: #ID Name|0:Val|1:Val
                let rowStr = `#${table.id} ${table.name}|`;
                
                const colEntries = Object.entries(row)
                    .sort((a, b) => parseInt(a[0]) - parseInt(b[0]))
                    .map(([idx, val]) => `${idx}:${val}`);
                
                rowStr += colEntries.join('|');
                result += rowStr + "\n";
            });
        });

        return result.trim();
    },

    /**
     * Merges new data into existing data.
     * If a row with the same key (column 0) exists, it updates it.
     * Otherwise, it adds a new row.
     */
    mergeLsrData(existing: Record<string, Record<string, string>[]>, incoming: Record<string, Record<string, string>[]>): Record<string, Record<string, string>[]> {
        const next = { ...existing };
        const tableDefs = this.parseDefinitions();

        Object.keys(incoming).forEach(tableId => {
            const existingRows = next[tableId] ? [...next[tableId]] : [];
            const incomingRows = incoming[tableId];

            const tableDef = tableDefs.find(t => t.id === tableId);
            const tableName = tableDef ? tableDef.name : `Bảng ${tableId}`;

            incomingRows.forEach(newRow => {
                const keyVal = newRow["0"]; // Column 0 is usually the ID/Name
                
                // Detect "REMOVE" value to delete the row
                const isDelete = Object.keys(newRow).some(k => {
                    if (k === "0") return false; // Don't delete just because primary key is empty/REMOVE, unless explicitly intended, but normally it's the other columns
                    const val = newRow[k];
                    return val.trim().toUpperCase() === "REMOVE";
                });

                if (isDelete && keyVal !== undefined) {
                    const existingIndex = existingRows.findIndex(r => r["0"] === keyVal);
                    if (existingIndex !== -1) {
                        existingRows.splice(existingIndex, 1);
                        toast(`🗑️ Đã xóa khỏi ${tableName}`, { description: keyVal });
                    }
                    return; // Skip adding/updating
                }

                if (keyVal === undefined) {
                    existingRows.push(newRow);
                } else {
                    const existingIndex = existingRows.findIndex(r => r["0"] === keyVal);
                    if (existingIndex !== -1) {
                        // Update existing row
                        existingRows[existingIndex] = { ...existingRows[existingIndex], ...newRow };
                        // Filter toasts for important tables
                        if (["4", "6", "12"].includes(tableId)) {
                            // Find what changed maybe? Just simple update toast
                            const updatedVal = newRow["1"] || newRow["2"] || "";
                            toast(`🔄 Cập nhật ${tableName}`, { description: `${keyVal} (${updatedVal})` });
                        }
                    } else {
                        // Add new row
                        existingRows.push(newRow);
                        if (["4", "6", "12"].includes(tableId)) {
                            let icon = "📦";
                            if (tableId === "4") icon = "⚠️";
                            if (tableId === "12") icon = "🛡️";
                            toast(`${icon} Mới trong ${tableName}`, { description: keyVal });
                        }
                    }
                }
            });

            // Giới hạn 10 dòng cho bảng "Thông tin Hiện tại" (ID #0)
            if (tableId === "0" && existingRows.length > 10) {
                next[tableId] = existingRows.slice(-10);
            } else {
                next[tableId] = existingRows;
            }
        });

        return next;
    }
};
