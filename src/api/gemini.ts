// FIX: Corrected import path for types from `./types` to `../types`.
import { ScoringStatus, Type, Point } from '../types';

// Used for TemplateEditor area detection
export const callGeminiAPI = async (prompt: string, imageBase64: string, mimeType = 'image/png', model = 'gemini-3-flash-preview') => {
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

    // Define the schema for the overall detection result
    const detectionSchema = {
        type: Type.OBJECT,
        properties: {
            "氏名": { type: Type.ARRAY, items: areaSchema, description: "検出された氏名欄のリスト。" },
            "解答": { type: Type.ARRAY, items: areaSchema, description: "検出された解答欄のリスト。" },
            "小計": { type: Type.ARRAY, items: areaSchema, description: "検出された小計欄のリスト。" },
            "合計": { type: Type.ARRAY, items: areaSchema, description: "検出された合計点欄のリスト。" }
        }
    };

    try {
        const result = await window.electronAPI.invoke('gemini-generate-content', {
            model: model, // Using passed model or default
            contents: {
                parts: [
                    { text: prompt },
                    { inlineData: { mimeType, data: imageBase64 } }
                ]
            },
            config: {
                responseMimeType: "application/json",
                responseSchema: detectionSchema, // Add the strict schema
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
    aiGradingMode?: 'auto' | 'strict', 
    answerFormat?: string,
    gradingSpeedMode?: 'quality' | 'speed',
    model: string = 'gemini-3-flash-preview' // Default to Gemini 3 Flash
) => {
    
    const maxPoints = point.points;
    let prompt = `あなたはテストの解答を採点する専門の先生です。
模範解答の画像と、複数の生徒の解答画像を一括で提供します。
各生徒の解答を模範解答と比較し、採点してください。
- 生徒の解答が正しい場合、statusは「${ScoringStatus.CORRECT}」、scoreは満点とします。
- 生徒の解答が誤っている場合、statusは「${ScoringStatus.INCORRECT}」、scoreは0とします。
- 生徒の解答が部分的に正しい場合、statusは「${ScoringStatus.PARTIAL}」、scoreは0から満点の間で部分点を評価してください。
- この問題の満点は${maxPoints}点です。`;

    if (aiGradingMode === 'strict' && answerFormat) {
        prompt += `

**重要**: この問題の解答は、記号または特定の単語です。正解は以下の文字のみで構成されている必要があります: 「${answerFormat}」。
これらの文字や単語以外が含まれている解答は、原則として「${ScoringStatus.INCORRECT}」(0点)と評価してください。
ただし、模範解答と完全に一致する場合は「${ScoringStatus.CORRECT}」としてください。軽微な書き方の違い（例：とめ、はね）は許容しますが、指定された文字以外は不正解です。`;
    }

    prompt += `
結果は必ずJSON配列形式でのみ返してください。配列内の各オブジェクトは、「studentId」「status」「score」のキーを持つ必要があります。
応答例:
[
  { "studentId": "student-1", "status": "${ScoringStatus.CORRECT}", "score": ${maxPoints} },
  { "studentId": "student-2", "status": "${ScoringStatus.INCORRECT}", "score": 0 }
]`;
    
    const responseSchemaProperties: any = {
        studentId: { type: Type.STRING },
        status: { type: Type.STRING, enum: [ScoringStatus.CORRECT, ScoringStatus.INCORRECT, ScoringStatus.PARTIAL] },
        score: { type: Type.INTEGER }
    };

    const contents: any = {
        parts: [
            { text: prompt },
            { text: "模範解答:" },
            { inlineData: { mimeType: 'image/png', data: masterSnippet } },
            { text: "生徒の解答:" },
        ]
    };

    studentSnippets.forEach(snippet => {
        contents.parts.push({ text: `生徒ID: ${snippet.studentId}` });
        contents.parts.push({ inlineData: { mimeType: 'image/png', data: snippet.base64 } });
    });

    const config: any = {
        responseMimeType: 'application/json',
        responseSchema: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: responseSchemaProperties,
                required: ["studentId", "status", "score"]
            }
        }
    };

    if (gradingSpeedMode === 'speed') {
        config.thinkingConfig = { thinkingBudget: 0 };
    }

    try {
        const result = await window.electronAPI.invoke('gemini-generate-content', {
            model: model, 
            contents,
            config,
        });

        if (result.success && result.text) {
             let parsedResults;
             try {
                // Clean up markdown ```json ... ```
                const jsonString = result.text.replace(/```json/g, '').replace(/```/g, '').trim();
                parsedResults = JSON.parse(jsonString);
             } catch (e) {
                return { error: 'Failed to parse JSON response from AI.' };
             }
            return { results: parsedResults };
        } else {
            return { error: result.error?.message || 'Unknown API error' };
        }
    } catch (error) {
        console.error('Error calling Gemini API for batch grading:', error);
        return { error: error.message };
    }
};