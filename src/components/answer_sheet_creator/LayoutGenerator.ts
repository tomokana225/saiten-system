import type { SheetLayout, SheetCell, LayoutConfig } from '../../types';

type PaperSize = 'A4' | 'B5' | 'A3';

export const PAPER_DIMENSIONS: Record<PaperSize, { width: number, height: number }> = {
    'A4': { width: 210, height: 297 },
    'B5': { width: 182, height: 257 },
    'A3': { width: 297, height: 420 },
};

export const createCell = (overrides: Partial<SheetCell> = {}): SheetCell => ({
    text: '', rowSpan: 1, colSpan: 1, hAlign: 'left', vAlign: 'middle',
    fontWeight: 'normal', fontStyle: 'normal', textDecoration: 'none',
    fontSize: 11, borders: { top: true, bottom: true, left: true, right: true },
    borderStyle: 'solid', borderColor: '#000000', borderWidth: 1,
    ...overrides
});

export const generateAutoLayout = (config: LayoutConfig): SheetLayout => {
    // Higher resolution grid for finer control
    const totalCols = 80; 
    const mmToPx = 3.78; 
    const baseRowHeightMm = config.defaultRowHeight || 10; 
    
    const cells: (SheetCell | null)[][] = [];
    const rowHeights: number[] = [];
    const colWidths: number[] = Array(totalCols).fill(((PAPER_DIMENSIONS[config.paperSize].width - 20) / totalCols) * mmToPx);

    const addRow = (heightMm: number = baseRowHeightMm) => {
        const row = Array(totalCols).fill(null).map(() => createCell({ borders: { top: false, bottom: false, left: false, right: false } }));
        cells.push(row);
        rowHeights.push(heightMm * mmToPx);
        return cells.length - 1;
    };

    const placeCell = (r: number, cIdx: number, span: number, content: SheetCell) => {
        while (r >= cells.length) addRow();
        if (cIdx >= totalCols) return;
        
        const safeSpan = Math.min(span, totalCols - cIdx);
        if (safeSpan <= 0) return;

        const cellContent = {
            ...content,
            borderWidth: content.borderWidth ?? config.borderWidth,
            borderColor: content.borderColor ?? config.borderColor,
        };

        cells[r][cIdx] = { ...cellContent, colSpan: safeSpan };
        for (let k = 1; k < safeSpan; k++) {
            if (cIdx + k < totalCols) cells[r][cIdx + k] = null;
        }
    };

    // --- Header Generation Logic ---
    const generateHeader = () => {
        const elements = config.headerElements || [
            { id: 'title', label: 'タイトル', height: 2, visible: true },
            { id: 'score', label: '点数欄', height: 2, visible: true },
            { id: 'name', label: '氏名欄', height: 1, visible: true }
        ];

        const visibleElements = elements.filter(e => e.visible);
        
        let i = 0;
        while (i < visibleElements.length) {
            const el = visibleElements[i];
            const nextEl = visibleElements[i+1];

            if (el.id === 'title' && nextEl && nextEl.id === 'score') {
                const scoreWidth = 16; // Fixed width for score in high-res grid
                const titleWidth = totalCols - scoreWidth;
                const rowSpan = Math.max(el.height, nextEl.height); 
                
                const startRow = addRow(14); 
                for(let k=1; k<rowSpan; k++) addRow(10);
                
                placeCell(startRow, 0, titleWidth, createCell({ 
                    text: config.name, rowSpan: rowSpan, fontSize: 18, fontWeight: 'bold', hAlign: 'center', 
                    borders: { top: true, bottom: true, left: true, right: true } 
                }));
                
                placeCell(startRow, titleWidth, scoreWidth, createCell({ 
                    text: '点数', fontSize: 10, vAlign: 'top', rowSpan: rowSpan,
                    borders: { top: true, bottom: true, left: true, right: true } 
                }));
                
                i += 2; 
            } else {
                const rowSpan = el.height;
                const startRow = addRow(el.id === 'title' ? 14 : 10);
                for(let k=1; k<rowSpan; k++) addRow(10);
                
                if (el.id === 'title') {
                    placeCell(startRow, 0, totalCols, createCell({ 
                        text: config.name, rowSpan: rowSpan, fontSize: 18, fontWeight: 'bold', hAlign: 'center', 
                        borders: { top: true, bottom: true, left: true, right: true } 
                    }));
                } else if (el.id === 'name') {
                    const infoWidth = Math.floor(totalCols / 3);
                    const nameWidth = totalCols - infoWidth;
                    placeCell(startRow, 0, infoWidth, createCell({ text: '  年     組     番', rowSpan: rowSpan }));
                    placeCell(startRow, infoWidth, nameWidth, createCell({ text: '氏名', rowSpan: rowSpan }));
                } else if (el.id === 'score') {
                     const scoreWidth = 16;
                     placeCell(startRow, totalCols - scoreWidth, scoreWidth, createCell({ 
                        text: '点数', fontSize: 10, vAlign: 'top', rowSpan: rowSpan,
                        borders: { top: true, bottom: true, left: true, right: true } 
                    }));
                }
                i++;
            }
        }
        addRow(6); 
    };

    const generateBody = () => {
        const sectionLabelWidth = 5; // slightly wider for high-res grid
        const contentAreaWidth = totalCols - sectionLabelWidth - 1;
        const contentStartCol = sectionLabelWidth;
        
        const useGap = config.gapBetweenQuestions !== false; // default true
        const gapSize = config.gapBetweenQuestions !== undefined ? config.gapBetweenQuestions : 2;

        let globalQNum = 1;
    
        config.sections.forEach(section => {
            const sectionStartRow = cells.length;
            
            let currentRow = addRow();
            let currentContentCol = 0; 
            let currentRowMaxHeightRatio = 1.0; 
    
            section.questions.forEach((q, idx) => {
                const qNumText = q.labelOverride || `${globalQNum}`;
                if (!q.labelOverride) globalQNum++;
    
                const qNumBoxWidth = 4; // Fixed width for Q number
                let answerBoxWidth = 0;
                
                if (q.type === 'marksheet') {
                    const choices = q.choices || 4;
                    answerBoxWidth = (choices * 5) - 1; // 5 units per choice
                } else if (q.type === 'long_text') {
                    answerBoxWidth = contentAreaWidth - qNumBoxWidth; 
                } else if (q.type === 'english_word') {
                     const wordCount = q.wordCount || 5;
                     // If manual words per line is set, calculate width based on that
                     if (q.wordsPerLine && q.wordsPerLine > 0) {
                         const wordsInLine = Math.min(wordCount, q.wordsPerLine);
                         answerBoxWidth = (wordsInLine * 8) - 1; // 8 units per word approx
                     } else {
                        // Default auto-width logic
                        const singleLineLimit = 6; 
                        if (wordCount > singleLineLimit) {
                            answerBoxWidth = contentAreaWidth - qNumBoxWidth;
                        } else {
                            answerBoxWidth = (wordCount * 8) - 1;
                        }
                     }
                } else {
                    // Text: map ratio 1..40 to width
                    // 40 is full width.
                    const ratio = Math.min(40, Math.max(1, q.widthRatio));
                    answerBoxWidth = Math.floor((contentAreaWidth * ratio) / 40) - qNumBoxWidth;
                    answerBoxWidth = Math.max(2, answerBoxWidth);
                }
    
                const totalItemWidth = qNumBoxWidth + answerBoxWidth;
                
                // Check wrapping
                const effectiveGap = currentContentCol > 0 ? gapSize : 0;
                if (currentContentCol + effectiveGap + totalItemWidth > contentAreaWidth) {
                    // Finalize previous row height
                    rowHeights[currentRow] = baseRowHeightMm * currentRowMaxHeightRatio * mmToPx;
                    // Add spacer row if gapSize > 0
                    if (gapSize > 0) {
                        addRow(gapSize * 2); // Scaled mm gap
                    }
                    currentRow = addRow();
                    currentContentCol = 0;
                    currentRowMaxHeightRatio = 1.0;
                } else {
                    currentContentCol += effectiveGap;
                }
    
                const heightRatio = q.heightRatio || 1.0;
                
                let englishRows = 1;
                if (q.type === 'english_word') {
                    const wordCount = q.wordCount || 5;
                    // 8 units per word (7 box + 1 gap)
                    const wordUnit = 7;
                    const gapUnit = 1;
                    // If width is constrained, how many fit?
                    // If wordsPerLine is set, use it. Otherwise calculate from width.
                    const wordsPerLine = q.wordsPerLine || Math.floor((answerBoxWidth + gapUnit) / (wordUnit + gapUnit));
                    englishRows = Math.ceil(wordCount / Math.max(1, wordsPerLine));
                }
                
                const totalHeightRatio = Math.max(heightRatio, englishRows);
                currentRowMaxHeightRatio = Math.max(currentRowMaxHeightRatio, totalHeightRatio);
    
                const absCol = contentStartCol + currentContentCol;
                
                // Q Num Box - spans English rows if needed, centered vertically
                placeCell(currentRow, absCol, qNumBoxWidth, createCell({ 
                    text: qNumText, 
                    hAlign: 'center', 
                    vAlign: 'middle', 
                    rowSpan: englishRows,
                    backgroundColor: '#f3f4f6'
                }));
    
                if (q.type === 'marksheet') {
                    const choices = q.choices || 4;
                    const labels = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
                    // Distribute choices evenly by splitting cells
                    const choiceSpan = Math.floor(answerBoxWidth / choices);
                    
                    for(let i=0; i<choices; i++) {
                        // Adjust span for last item to fill remaining space
                        const isLast = i === choices - 1;
                        const span = isLast ? answerBoxWidth - (choiceSpan * (choices-1)) : choiceSpan;
                        
                        // Determine border visibility to look like one big box
                        const borderLeft = i === 0;
                        const borderRight = isLast;
                        
                        placeCell(currentRow, absCol + qNumBoxWidth + (i * choiceSpan), span, createCell({
                            text: labels[i], 
                            hAlign: 'center',
                            // Internal vertical borders removed
                            borders: { 
                                top: true, 
                                bottom: true, 
                                left: borderLeft, 
                                right: borderRight 
                            }
                        }));
                    }
                } else if (q.type === 'english_word') {
                    const wordCount = q.wordCount || 5;
                    const wordUnit = 7;
                    const gapUnit = 1;
                    const wordsPerLine = q.wordsPerLine || Math.floor((answerBoxWidth + gapUnit) / (wordUnit + gapUnit));
                    
                    for(let i=0; i<wordCount; i++) {
                        const lineIndex = Math.floor(i / wordsPerLine);
                        const indexInLine = i % wordsPerLine;
                        
                        const targetRow = currentRow + lineIndex;
                        if (targetRow >= rowHeights.length) {
                            addRow();
                        }
                        
                        const pos = indexInLine * (wordUnit + gapUnit);
                        
                        placeCell(targetRow, absCol + qNumBoxWidth + pos, wordUnit, createCell({
                            text: '', 
                            vAlign: 'bottom', // Align underline to bottom
                            borders: { 
                                top: false, 
                                left: false, 
                                right: false, 
                                bottom: true 
                            },
                            borderStyle: 'dashed',
                            borderColor: '#000'
                        }));
                    }
                    // Sync row heights for the block
                    for(let r=0; r<englishRows; r++) {
                         const rIdx = currentRow + r;
                         if (rIdx < rowHeights.length) {
                             rowHeights[rIdx] = Math.max(rowHeights[rIdx] || 0, baseRowHeightMm * mmToPx);
                         }
                    }
                } else {
                    placeCell(currentRow, absCol + qNumBoxWidth, answerBoxWidth, createCell({ text: '' }));
                }
    
                currentContentCol += totalItemWidth; 
            });
            
            // Finalize first row height (max of single-line items or first line of multi-line)
            rowHeights[currentRow] = baseRowHeightMm * currentRowMaxHeightRatio * mmToPx;
    
            const sectionEndRow = cells.length;
            const rowSpan = sectionEndRow - sectionStartRow;
            if (rowSpan > 0) {
                placeCell(sectionStartRow, 0, sectionLabelWidth, createCell({
                    text: section.title, rowSpan: rowSpan, hAlign: 'center', vAlign: 'middle',
                    fontSize: 14, fontWeight: 'bold', backgroundColor: '#e5e7eb'
                }));
                // Cleanup underlying cells for section label
                for(let rr=sectionStartRow+1; rr<sectionEndRow; rr++) {
                    if (rr < cells.length) { 
                        for(let cc=0; cc<sectionLabelWidth; cc++) { if (cc < totalCols) cells[rr][cc] = null; }
                    }
                }
            }
            
            if (gapSize > 0) addRow(gapSize * 2); // Section gap
        });
    };

    if (config.headerPosition === 'bottom') {
        generateBody();
        addRow(10);
        generateHeader();
    } else {
        generateHeader();
        generateBody();
    }

    return {
        id: `layout_${Date.now()}`,
        name: config.name,
        rows: cells.length,
        cols: totalCols,
        rowHeights,
        colWidths,
        cells,
        config,
    };
};