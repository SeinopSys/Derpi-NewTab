const { BehaviorSubject } = rxjs;
const { distinctUntilChanged } = rxjs.operators;

class Connectivity {
	constructor() {
		this.onlineSource = new BehaviorSubject(navigator.onLine);
		this.online = this.onlineSource.asObservable().pipe(distinctUntilChanged());

		window.addEventListener('online', () => {
			this.onlineSource.next(true);
		});
		window.addEventListener('offline', () => {
			this.onlineSource.next(false);
		});
	}

	isOnline(){
		return this.onlineSource.value;
	}
}

export default (new Connectivity());
