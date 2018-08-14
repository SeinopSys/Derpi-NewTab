const { BehaviorSubject } = rxjs;
const { distinctUntilChanged } = rxjs.operators;

const onlineSource = new BehaviorSubject(navigator.onLine);

class Connectivity {
	constructor() {
		this.online = onlineSource.asObservable().pipe(distinctUntilChanged());

		window.addEventListener('online', () => {
			onlineSource.next(true);
		});
		window.addEventListener('offline', () => {
			onlineSource.next(false);
		});
	}

	isOnline(){
		return onlineSource.value;
	}
}

export default (new Connectivity());
