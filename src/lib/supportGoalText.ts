import type {ProfessionalPlanDoc} from '../types/professionalPlan';
export function supportGoalText(profPlan:ProfessionalPlanDoc|null,fallback=''):string {
    let targetGoals = fallback; 
    if (profPlan) {
      const parts = [];
      
      // 長期目標・短期目標の複数項目フォーマット用のヘルパー
      const formatGoalText = (labelText: string, rawText: string | undefined): string | null => {
        if (!rawText || !rawText.trim()) return null;
        
        const items = rawText
          .split('\n')
          .map(line => line.trim().replace(/^[・\-\*\s\u30fb]+/g, ''))
          .filter(line => line.length > 0);
          
        if (items.length === 0) return null;
        
        let content = '';
        if (items.length === 1) {
          content = items[0];
        } else {
          const circleNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
          content = items.map((item, idx) => {
            const numPrefix = circleNumbers[idx] || `(${idx + 1})`;
            return `${numPrefix}${item}`;
          }).join('');
        }
        return `${labelText}：${content}`;
      };

      const longTerm = formatGoalText('長期目標', profPlan.longTermGoal);
      if (longTerm) parts.push(longTerm);
      
      const shortTerm = formatGoalText('短期目標', profPlan.shortTermGoal);
      if (shortTerm) parts.push(shortTerm);
      
      const rawGoals = (profPlan.supportRows || [])
        .filter((r: any) => r.supportGoal && r.supportGoal.trim() !== '')
        .map((r: any) => r.supportGoal.trim().replace(/^[・\-\*\s\u30fb]+/g, ''));
      
      if (rawGoals.length > 0) {
        const circleNumbers = ['①', '②', '③', '④', '⑤', '⑥', '⑦', '⑧', '⑨', '⑩'];
        const formattedList = rawGoals.map((goal: string, idx: number) => {
          const numPrefix = circleNumbers[idx] || `(${idx + 1})`;
          return `${numPrefix}${goal}`;
        }).join('');
        
        parts.push(`具体的目標：${formattedList}`);
      }
      targetGoals = parts.join('\n');
    }
    return targetGoals;
}
