
export const buildWorldCreationPrompt = (fieldName: string, currentContext: Record<string, unknown>, userInput?: string) => {
  // MODE B: ENRICH / EXPAND (When user input is provided)
  if (userInput && userInput.trim().length > 0) {
    return `TASK: Rewrite and expand the following User Input for the field "${fieldName}".
CONTEXT: ${JSON.stringify(currentContext)}
USER INPUT: "${userInput}"

INSTRUCTIONS:
1. Enhance the vocabulary and descriptive quality.
2. Make it sound professional and fitting for a fantasy/sci-fi setting.
3. OUTPUT ONLY THE FINAL CONTENT. NO META-COMMENTARY.`;
  }

  // MODE A: CREATE NEW (When input is empty)
  return `
  Task: Create content for the data field: "${fieldName}".
  Current Context: ${JSON.stringify(currentContext)}
  
  Requirements:
  - Return ONLY the content of that field. No explanation, no introduction or conclusion.
  - Creative, unique, avoid clichés.
  - If field is "worldName": Create a poetic, symbolic, or evocative name that fits the genre and context. Avoid generic names like "Thế giới X".
  - Language: Vietnamese.
  `;
};

export const getWorldCreationSystemInstruction = (category: 'player' | 'world' | 'entity', field: string, userInput?: string) => {
  // SYSTEM INSTRUCTION FOR MODE B (ENRICH)
  if (userInput && userInput.trim().length > 0) {
    return `You are an expert editor and creative writer. Your task is to polish, expand, and enrich the user's rough idea into a high-quality description.

Strict Constraints:
1. Zero Conversational Filler: DO NOT say "Here is the improved version", "Based on your input", etc. Just return the final content.
2. Domain Isolation: Ensure the content fits the definition of field "${field}". Do not change the type of information (e.g. do not turn a Skill into an Appearance description).
3. Content Fidelity: Keep the core characteristics defined in the user input.
4. Language: Vietnamese.`;
  }

  // SYSTEM INSTRUCTION FOR MODE A (CREATE NEW) - Old logic
  if (category === 'player') {
    return `You are a professional RPG character creation assistant.
Task: Write content for the data field [${field}] of the main character.
Output Rules:
- Return ONLY the descriptive content. DO NOT write an introduction.
- Language: Vietnamese.
- Style: Creative, deep, fitting for the character setting.`;
  } 
  
  if (category === 'world') {
    let fieldDetail = `Write a detailed description for [${field}] of the world.`;
    
    if (field === 'corePremise') {
      fieldDetail = `Khởi tạo KHÁI NIỆM CỐT LÕI (Core Premise) của thế giới. 
- Mô tả giả thuyết tối quan trọng của thế giới (ví dụ: một thảm họa, một bí ẩn cổ đại, hoặc một phép màu thay đổi tất cả).
- Tạo ra xung đột trung tâm mang tính định hình vận mệnh thế giới.
- Giọng văn: Sử thi, hùng vĩ, gợi cảm giác tò mò và đầy chất văn học. Nhắm tới 2-3 đoạn văn cô đọng nhưng cực kỳ sâu sắc.`;
    } else if (field === 'cosmology') {
      fieldDetail = `Thiết lập VŨ TRỤ HỌC & QUY LUẬT CƠ BẢN (Cosmology & Fundamental Rules).
- Giải thích cấu trúc đa vũ trụ, thần thoại sáng thế hoặc các chiều không gian.
- Định hình quy luật vật lý hoặc quy luật ma thuật (ví dụ: Shard-Singing - hát mảnh vỡ, cách thức hoạt động, hạn chế nghiêm ngặt, cái giá phải trả của sức mạnh).
- Giọng văn: Huyền bí, thông tuệ, như được chép từ một thư viện học thuật cổ xưa.`;
    } else if (field === 'timeline') {
      fieldDetail = `Xây dựng DÒNG THỜI GIAN CHÍNH & LỊCH SỬ LỚN (Timeline & Major Epochs).
- Viết dưới dạng biên niên sử gồm 3-4 thời kỳ (Epochs) chính (ví dụ: Kỷ Nguyên Thần Mặt Trời -> Cuộc Khởi Nghĩa Trị Cấm -> Kỷ Nguyên Mảnh Vỡ Tận Thế).
- Mỗi thời kỳ chứa các sự kiện định hình nên hiện trạng xã hội hiện nay.
- Giọng văn: Tính lịch sử cao, hào hùng, bi tráng, súc tích bằng bullet points.`;
    } else if (field === 'geography') {
      fieldDetail = `Phác họa ĐỊA LÝ & KHÍ HẬU (Geography & Landscapes).
- Mô tả các lục địa, vùng đất dị khí hậu nguy hiểm, hoặc các khu định cư chính khổng lồ (vương quốc, pháo đài tự nhiên, thành phố chìm...).
- Gợi tả cảm giác không gian sinh tồn chịu áp lực từ môi trường.
- Giọng văn: Giàu tính tạo hình, nghệ thuật miêu tả phong cảnh sắc sảo, đánh thức các giác quan.`;
    } else if (field === 'factionsPower') {
      fieldDetail = `Mô tả HỆ THỐNG PHE PHÁI & CƠ CẤU QUYỀN LỰC (Factions & Power Dynamics).
- Trình bày các bang phái cai trị, thế lực ngầm phản động, vương triều tàn tạ, hoặc tổ chức thương hội lũng đoạn.
- Đưa ra các mâu thuẫn hệ thống, liên minh mong manh, và trạng thái cân bằng mong manh hiện tại.
- Giọng văn: Sắc sảo, chính trị mưu mô, đầy tính toán và căng thẳng.`;
    } else if (field === 'economyResources') {
      fieldDetail = `Phát triển KINH TẾ & TÀI NGUYÊN (Economy & Resources).
- Nguồn tài nguyên quý báu thúc đẩy nền kinh tế (khoáng thạch ma pháp, thảo dược cổ, năng lượng vũ trụ) và cách con người khai thác chúng.
- Phương thức thanh toán, giao thương (tiền tệ thần điểu, ngọc hồn, hay hệ thống đổi chác đặc biệt).
- Giọng văn: Chi tiết, logic thực tế, phù hợp với tiến trình phát triển xã hội của thế giới.`;
    } else if (field === 'culturalIdentity') {
      fieldDetail = `Khám phá BẢN SẮC VĂN HÓA & NGHI LỄ (Cultural Identity & Taboos).
- Tập quán, đức tin tâm linh, lối sống sinh tồn đặc hữu của cư dân bản địa qua các thời kỳ.
- Các điều cấm kỵ (taboo) tối linh thiêng mà bất kỳ ai vi phạm đều chịu hậu quả kinh hoàng.
- Giọng văn: Đầy chiều sâu nhân văn, sinh động, mang sắc màu nhân chủng học.`;
    } else if (field === 'adventureHooks') {
      fieldDetail = `Gieo mầm các MÓC PHIÊU LƯU & BÍ ẨN (Adventure Hooks).
- Tạo ra 3-4 ý tưởng cốt truyện hoặc nhiệm vụ nguy cấp sẵn có ở thế giới (những vụ mất tích kỳ huyễn, lời nguyền tái sinh, di tích cổ mới hé mở cửa...).
- Đặt ra các câu hỏi mở đầy lôi cuốn khiến người chơi muốn bước vào thám hiểm ngay lập tức.
- Giọng văn: Cuốn hút, dồn dập, hồi hộp, kịch tính.`;
    }

    return `You are a master virtual world architect (World Builder) and fantasy/sci-fi novelist.
Task: ${fieldDetail}

Output Rules:
- Return ONLY the generated descriptive content. DO NOT write any meta-text, introductions, or conclusions ("Dưới đây là...", "Here is...").
- Language: Vietnamese.
- If field is "worldName": Be extremely creative. Use metaphors, ancient languages, or symbolic terms. Avoid generic names like "Thế giới X".
- Style: Highly immersive, grand, logical, deeply atmospheric, and with literary depth.`;
  } 
  
  // Entity
  return `You are a creator of NPC content and events for RPG Games.
Task: Write [${field}] for an entity in the game.
Output Rules:
- Return ONLY the main content. DO NOT write an introduction.
- Language: Vietnamese.`;
};
