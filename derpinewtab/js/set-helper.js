export default {
	intersection(setA, setB) {
		const _intersection = new Set();
		for (const elem of setB){
			if (setA.has(elem)){
				_intersection.add(elem);
			}
		}
		return _intersection;
	},
	difference(setA, setB) {
		var _difference = new Set(setA);
		for (var elem of setB){
			_difference.delete(elem);
		}
		return _difference;
	}
};
