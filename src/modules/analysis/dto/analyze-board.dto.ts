import { AnalyzeOutfitDto } from './analyze-outfit.dto';

// Mismos campos que AnalyzeOutfitDto (city, budget?, size?) - se extiende en vez de duplicar
// los decoradores de class-validator.
export class AnalyzeBoardDto extends AnalyzeOutfitDto {}
