
import {
  GenerateContentResponse,
  GenerateContentParameters,
  Part,
} from '@google/genai';

// @google/genai type enum, used for response schema
export enum Type {
    TYPE_UNSPECIFIED = 'TYPE_UNSPECIFIED',
    STRING = 'STRING',
    NUMBER = 'NUMBER',
    INTEGER = 'INTEGER',
    BOOLEAN = 'BOOLEAN',
    ARRAY = 'ARRAY',
    OBJECT = 'OBJECT',
    NULL = 'NULL',
}

// App-wide enums and string unions
export enum AppMode {
    HOME = 'ホーム',
    GRADING = '採点',
    ROSTER = '名簿管理',
    AGGREGATION = '成績集計',
    SHEET_CREATOR = '解答用紙作成',
}

export enum AppStep {
    CLASS_SELECTION = 'CLASS_SELECTION',
    TEMPLATE_UPLOAD = 'TEMPLATE_UPLOAD',
    AREA_SELECTION = 'AREA_SELECTION',
    STUDENT_INFO_INPUT = 'STUDENT_INFO_INPUT',
    STUDENT_UPLOAD = 'STUDENT_UPLOAD',
    STUDENT_VERIFICATION = 'STUDENT_VERIFICATION',
    POINT_ALLOCATION = 'POINT_ALLOCATION',
    GRADING = 'GRADING',
    RESULTS = 'RESULTS',
    SETTINGS = 'SETTINGS',
}

export enum ScoringStatus {
    UNSCORED = 'UNSCORED',
    CORRECT = 'CORRECT',
    INCORRECT = 'INCORRECT',
    PARTIAL = 'PARTIAL',
}

export enum AreaType {
    ANSWER = '解答',
    NAME = '氏名',
    SUBTOTAL = '小計',
    TOTAL = '合計',
    MARK_SHEET = 'マークシート',
    QUESTION_NUMBER = '問題番号',
    ALIGNMENT_MARK = '基準マーク',
    STUDENT_ID_MARK = '学籍番号',
    STUDENT_ID_REF_RIGHT = '学籍番号基準(右)',
    STUDENT_ID_REF_BOTTOM = '学籍番号基準(下)',
    MARKSHEET_REF_RIGHT = 'マークシート基準(右)',
    MARKSHEET_REF_BOTTOM = 'マークシート基準(下)',
}

export type GradingFilter = 'ALL' | 'SCORED' | ScoringStatus;

// --- Export/Import Utilities ---
export interface ExportImportOptions {
    includeTemplate: boolean;
    includeStudents: boolean;
    includeAnswers: boolean;
}

// Core data structures
export interface TemplatePage {
    imagePath: string;
    width: number;
    height: number;
}

export interface Template {
    id: string;
    name: string;
    filePath?: string;
    width?: number;
    height?: number;
    pages: TemplatePage[];
    alignmentMarkIdealCorners?: {
        tl: { x: number, y: number },
        tr: { x: number, y: number },
        br: { x: number, y: number },
        bl: { x: number, y: number },
    };
}

export interface Area {
    id: number;
    name: string;
    type: AreaType;
    x: number;
    y: number;
    width: number;
    height: number;
    pageIndex: number;
    questionNumber?: number;
}

export interface StudentInfo {
    id: string;
    class: string;
    number: string;
    name: string;
}

export interface Student {
    id: string;
    originalName: string;
    filePath: string | null;
    images: (string | null)[];
}

export interface Roster {
    id: string;
    name: string;
    students: Omit<StudentInfo, 'id'>[];
}

export interface Point {
    id: number;
    points: number;
    label: string;
    subtotalIds: number[];
    questionNumberAreaId?: number;
    markSheetOptions?: number;
    markSheetLayout?: 'horizontal' | 'vertical';
    correctAnswerIndex?: number;
    markRefRightAreaId?: number;
    markRefBottomAreaId?: number;
}

export type AnnotationTool = 'pen' | 'wave' | 'circle' | 'text';

interface BaseAnnotation {
    id: string;
    tool: AnnotationTool;
    color: string;
}
export interface PenAnnotation extends BaseAnnotation {
    tool: 'pen';
    strokeWidth: number;
    points: { x: number; y: number }[];
}
export interface WaveAnnotation extends BaseAnnotation {
    tool: 'wave';
    strokeWidth: number;
    points: { x: number; y: number }[];
}
export interface CircleAnnotation extends BaseAnnotation {
    tool: 'circle';
    strokeWidth: number;
    x: number;
    y: number;
    width: number;
    height: number;
}
export interface TextAnnotation extends BaseAnnotation {
    tool: 'text';
    fontSize: number;
    x: number;
    y: number;
    text: string;
}
export type Annotation = PenAnnotation | WaveAnnotation | CircleAnnotation | TextAnnotation;

export interface ScoreData {
    status: ScoringStatus;
    score: number | null;
    annotations?: Annotation[];
    detectedMarkIndex?: number | number[];
    detectedPositions?: { x: number, y: number }[];
    manualPanOffset?: { x: number; y: number };
}

export type AllScores = Record<string, Record<number, ScoreData>>;

export interface AISettings {
    batchSize: number;
    delayBetweenBatches: number;
    gradingMode: 'quality' | 'speed';
    markSheetSensitivity: number;
    aiModel: string;
}

export interface GradingProject {
    id: string;
    name: string;
    template: Template | null;
    areas: Area[];
    studentInfo: StudentInfo[];
    uploadedSheets: Student[];
    points: Point[];
    scores: AllScores;
    aiSettings: AISettings;
    lastModified: number;
}

export interface StudentResult extends Student, StudentInfo {
    totalScore: number;
    subtotals: { [subtotalAreaId: number]: number };
    standardScore: string;
    rank: number | null;
    classRank: number | null;
    isAbsent: boolean;
}

export interface QuestionStats {
    id: number;
    label: string;
    fullMarks: number;
    averageScore: number;
    correctCount: number;
    partialCount: number;
    incorrectCount: number;
    unscoredCount: number;
    totalStudents: number;
    correctRate: number;
    partialRate: number;
    incorrectRate: number;
}

export type NumberingStyle = '1' | '(1)' | '[1]' | '①' | 'A' | 'a' | 'I' | 'i' | 'ア' | 'none';

export interface SheetCell {
    text: string;
    rowSpan: number;
    colSpan: number;
    hAlign: 'left' | 'center' | 'right';
    vAlign: 'top' | 'middle' | 'bottom';
    fontWeight: 'normal' | 'bold';
    fontStyle: 'normal' | 'italic';
    textDecoration: 'none' | 'underline';
    fontSize: number;
    backgroundColor?: string;
    borders: {
        top: boolean;
        bottom: boolean;
        left: boolean;
        right: boolean;
    };
    borderStyle?: 'solid' | 'dashed' | 'dotted' | 'double' | 'none';
    borderColor?: string;
    borderWidth?: number;
    type?: 'text' | 'english-grid';
    metadata?: any;
}

export interface HeaderElement {
    id: 'title' | 'name' | 'score';
    label: string;
    height: number;
    visible: boolean;
}

export interface LayoutConfig {
    name: string;
    paperSize: 'A4' | 'B5' | 'A3';
    borderWidth: number;
    borderColor: string;
    defaultRowHeight: number;
    gapBetweenQuestions?: number;
    sections: {
        id: string;
        title: string;
        numberingStyle?: NumberingStyle;
        questions: {
            id: string;
            type: 'text' | 'marksheet' | 'long_text' | 'english_word';
            widthRatio: number;
            heightRatio: number;
            lineHeightRatio?: number;
            chars?: number;
            choices?: number;
            wordCount?: number;
            wordsPerLine?: number; 
            labelOverride?: string;
        }[];
    }[];
    headerElements?: HeaderElement[];
    headerPosition?: 'top' | 'bottom';
    headerSettings?: any;
}

export interface SheetLayout {
    id: string;
    name: string;
    rows: number;
    cols: number;
    rowHeights: number[];
    colWidths: number[];
    cells: (SheetCell | null)[][];
    config?: LayoutConfig;
}

export interface LayoutSettings {
    mark: {
        show: boolean;
        fontSize: number;
        opacity: number;
        correctColor: string;
        incorrectColor: string;
        partialColor: string;
        hAlign: 'left' | 'center' | 'right';
        vAlign: 'top' | 'middle' | 'bottom';
        hOffset: number;
        vOffset: number;
        positioningMode: 'answer_area' | 'question_number_area';
    };
    point: {
        fontSize: number;
        color: string;
        corner: 'bottom-right' | 'top-right' | 'top-left' | 'bottom-left';
        hOffset: number;
        vOffset: number;
    };
    subtotal: {
        fontSize: number;
        showScore: boolean;
        color: string;
        colors: Record<number, string>;
        hAlign: 'left' | 'center' | 'right';
        vAlign: 'top' | 'middle' | 'bottom';
    };
    total: {
        fontSize: number;
        showScore: boolean;
        color: string;
        hAlign: 'left' | 'center' | 'right';
        vAlign: 'top' | 'middle' | 'bottom';
    };
    studentInfo: {
        show: boolean;
        fontSize: number;
        color: string;
        vOffset: number;
    };
}

export interface ReportLayoutSettings {
    orientation: 'portrait' | 'landscape';
    reportsPerPage: 1 | 2 | 4;
    questionTableColumns: 1 | 2 | 3;
    showStandardScoreGraph: boolean;
    showScoreTable: boolean;
    showPerformanceGraph: boolean;
    showTeacherComment: boolean;
    showQuestionCorrectRate: boolean;
}
