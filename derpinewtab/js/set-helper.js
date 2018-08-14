export default {
	intersection(setA, setB) {
		const _intersection = new Set();
		for (const elem of setB){
			if (setA.has(elem)){
				_intersection.add(elem);
			}
		}
		return _intersection;
	}
};
