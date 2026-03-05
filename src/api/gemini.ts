
import { ScoringStatus, Type, Point } from '../types';

// Used for TemplateEditor area detection
export const callGeminiAPI = async (prompt: string, imageBase64: string, apiKey?: string, mimeType = 'image/png', model = 'gemini-3-flash-preview') => {
    // Define the schema for a single detected area
    const areaSchema = {
        type: Type.OBJECT,
        properties: {
            label: { type: Type.STRING, description: '領域のラベル（例: "問1", "氏名"）' },
            x: { type: Type.INTEGER, description: '領域の左上のX座標' },
            y: { type: Type.INTEGER, description: '領域の左上のY座標' },
            width: { type: Type.INTEGER, description: '領域の幅' },
            height: { type: Type.INTEGER, description: '領域の高さ' }
        },
        required: ["label", "x", "y", "width", "height"]
    };

    // Define the schema for the overall detection result - MUST cover all AreaType strings
    const detectionSchema = {
        type: Type.OBJECT,
        properties: {
            "氏名": { type: Type.ARRAY, items: areaSchema, description: "検出された氏名欄のリスト。" },
            "解答": { type: Type.ARRAY, items: areaSchema, description: "検出された解答欄のリスト。" },
            "小計": { type: Type.ARRAY, items: areaSchema, description: "検出された小計欄のリスト。" },
            "合計": { type: Type.ARRAY, items: areaSchema, description: "検出された合計点欄のリスト。" },
            "マークシート": { type: Type.ARRAY, items: areaSchema, description: "検出されたマークシート領域のリスト。" },
            "問題番号": { type: Type.ARRAY, items: areaSchema, description: "検出された問題番号領域のリスト。" },
            "基準マーク": { type: Type.ARRAY, items: areaSchema, description: "検出された基準マークのリスト。" },
            "学籍番号": { type: Type.ARRAY, items: areaSchema, description: "検出された学籍番号領域のリスト。" },
            "学籍番号基準(右)": { type: Type.ARRAY, items: areaSchema, description: "学籍番号の右側の基準マーク。" },
            "学籍番号基準(下)": { type: Type.ARRAY, items: areaSchema, description: "学籍番号の下側の基準マーク。" },
            "マークシート基準(右)": { type: Type.ARRAY, items: areaSchema, description: "マークシートの右側の基準マーク。" },
            "マークシート基準(下)": { type: Type.ARRAY, items: areaSchema, description: "マークシートの下側の基準マーク。" }
        }
    };

    const systemInstruction = `あなたはテスト用紙のレイアウトを解析する専門家です。
画像の中から指示された種類の入力欄や解答欄を検出し、その座標を返してください。
座標は画像の左上を(0,0)としたピクセル単位で指定してください。
指定された中心座標の周辺にある、最も適切な四角い枠線を1つだけ特定してください。`;

    try {
        const result = await window.electronAPI.invoke('gemini-generate-content', {
            model: model, 
            apiKey: apiKey,
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } }
                ]
            },
            config: {
                systemInstruction,
                responseMimeType: "application/json",
                responseSchema: detectionSchema,
            }
        });
        return result;
    } catch (error) {
        console.error('Error calling Gemini API for area detection:', error);
        return { success: false, error: { message: error.message } };
    }
};

interface StudentSnippet {
    studentId: string;
    base64: string;
}

// Used for GradingView batch scoring of descriptive answers
export const callGeminiAPIBatch = async (
    masterSnippet: string, 
    studentSnippets: StudentSnippet[], 
    point: Point,
    apiKey?: string,
    aiGradingMode?: 'auto' | 'strict', 
    answerFormat?: string,
    gradingSpeedMode?: 'quality' | 'speed',
    model: string = 'gemini-3-flash-preview'
) => {
    const maxPoints = point.points;
    
    const systemInstruction = `あなたはテストの解答を採点する専門の先生です。
模範解答の画像と、複数の生徒の解答画像を一括で提供します。
各生徒の解答を模範解答と比較し、公平かつ正確に採点してください。

採点基準:
- 正解: statusは「${ScoringStatus.CORRECT}」、scoreは満点(${maxPoints})。
- 不正解: statusは「${ScoringStatus.INCORRECT}」、scoreは0。
- 部分的な正解: statusは「${ScoringStatus.PARTIAL}」、scoreは0から満点の間で適切に評価。
- 白紙または判読不能: statusは「${ScoringStatus.INCORRECT}」、scoreは0。

重要事項:
- 採点理由(aiComment)を日本語で簡潔に（20文字以内）記述してください。
- 丁寧な字で書かれているか、誤字脱字がないかなども考慮してください。`;

    let prompt = `以下の生徒の解答を採点してください。この問題の満点は${maxPoints}点です。`;

    if (aiGradingMode === 'strict' && answerFormat) {
        prompt += `

**厳格モード**: この問題の解答は、記号または特定の単語です。正解は以下の文字のみで構成されている必要があります: 「${answerFormat}」。
指定された文字以外が含まれている場合は、原則として不正解(0点)としてください。`;
    }

    const responseSchema = {
        type: Type.ARRAY,
        items: {
            type: Type.OBJECT,
            properties: {
                studentId: { type: Type.STRING },
                status: { type: Type.STRING, enum: [ScoringStatus.CORRECT, ScoringStatus.INCORRECT, ScoringStatus.PARTIAL] },
                score: { type: Type.INTEGER },
                aiComment: { type: Type.STRING, description: "採点理由の簡潔な説明" }
            },
            required: ["studentId", "status", "score", "aiComment"]
        }
    };

    const contents: any = {
        parts: [
            { text: prompt },
            { text: "模範解答:" },
            { inlineData: { mimeType: 'image/png', data: masterSnippet } },
            { text: "生徒の解答リスト:" },
        ]
    };

    studentSnippets.forEach(snippet => {
        contents.parts.push({ text: `生徒ID: ${snippet.studentId}` });
        contents.parts.push({ inlineData: { mimeType: 'image/png', data: snippet.base64 } });
    });

    const config: any = {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema
    };

    // Enable thinking for better quality if using a Gemini 3 model
    if (model.includes('gemini-3')) {
        if (gradingSpeedMode === 'quality') {
            config.thinkingConfig = { thinkingLevel: 'HIGH' };
        } else if (gradingSpeedMode === 'speed') {
            config.thinkingConfig = { thinkingLevel: 'LOW' };
        }
    }

    try {
        const result = await window.electronAPI.invoke('gemini-generate-content', {
            model: model, 
            apiKey: apiKey,
            contents,
            config,
        });

        if (result.success && result.text) {
             let parsedResults;
             try {
                const jsonString = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
                parsedResults = JSON.parse(jsonString);
             } catch (e) {
                console.error('JSON Parse Error:', e, result.text);
                return { error: 'AIからの応答の解析に失敗しました。' };
             }
            return { results: parsedResults };
        } else {
            return { error: result.error?.message || '不明なAPIエラーが発生しました。' };
        }
    } catch (error) {
        console.error('Error calling Gemini API for batch grading:', error);
        return { error: error.message };
    }
};
