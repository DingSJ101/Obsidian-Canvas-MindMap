import { Canvas, CanvasEdge, CanvasGroupNode, CanvasNode, requireApiVersion, TFile } from "obsidian";
import { CanvasData, CanvasEdgeData, CanvasFileData, CanvasNodeData, CanvasTextData } from "obsidian/canvas";

interface edgeT {
	fromOrTo: string;
	side: string,
	node: CanvasNode | CanvasNodeData,
}

interface TreeNode {
	id: string;
	children: TreeNode[];
}

export const random = (e: number) => {
	let t = [];
	for (let n = 0; n < e; n++) {
		t.push((16 * Math.random() | 0).toString(16));
	}
	return t.join("");
};

export const createChildFileNode = (canvas: any, parentNode: any, file: TFile, path: string, y: number) => {
	const node = addNode(
		canvas, random(16),
		{
			x: parentNode.x + parentNode.width + 200,
			y: y,
			width: parentNode.width,
			height: parentNode.height * 0.6,

			type: 'file',
			content: file.path,
			subpath: path,
		}
	);

	addEdge(canvas, random(16), {
		fromOrTo: "from",
		side: "right",
		node: parentNode
	}, {
		fromOrTo: "to",
		side: "left",
		node: <CanvasNodeData>node
	});

	canvas.requestSave();

	return node;
};


export const addNode = (canvas: Canvas, id: string, {
	x,
	y,
	width,
	height,
	type,
	content,
	subpath,
}: {
	x: number,
	y: number,
	width: number,
	height: number,
	type: 'text' | 'file',
	content: string,
	subpath?: string,
}) => {
	if (!canvas) return;

	const data = canvas.getData();
	if (!data) return;

	const node: Partial<CanvasTextData | CanvasFileData> = {
		"id": id,
		"x": x,
		"y": y,
		"width": width,
		"height": height,
		"type": type,
	};

	switch (type) {
		case 'text':
			node.text = content;
			break;
		case 'file':
			node.file = content;
			if (subpath) node.subpath = subpath;
			break;
	}

	canvas.importData(<CanvasData>{
		"nodes": [
			...data.nodes,
			node],
		"edges": data.edges,
	});

	canvas.requestFrame();

	return node;
};

export const addEdge = (canvas: any, edgeID: string, fromEdge: edgeT, toEdge: edgeT) => {
	if (!canvas) return;

	const data = canvas.getData();
	if (!data) return;

	canvas.importData({
		"edges": [
			...data.edges,
			{
				"id": edgeID,
				"fromNode": fromEdge.node.id,
				"fromSide": fromEdge.side,
				"toNode": toEdge.node.id,
				"toSide": toEdge.side
			}
		],
		"nodes": data.nodes,
	});

	canvas.requestFrame();
};

export function buildTrees(canvasData: CanvasData, direction: 'LR' | 'RL' | 'TB' | 'BT'): TreeNode[] {
	const trees: TreeNode[] = [];
	const nodeMap: Map<string, TreeNode> = new Map();
	const edgeMap: Map<string, string[]> = new Map();

	canvasData.nodes.forEach(node => {
		nodeMap.set(node.id, {
			...node,
			children: []
		});
	});

	canvasData.edges.forEach(edge => {
		if (!edgeMap.has(edge.fromNode)) {
			edgeMap.set(edge.fromNode, []);
		}
		edgeMap.get(edge.fromNode)?.push(edge.toNode);
	});

	const rootNodes = canvasData.nodes.filter(node =>
		!canvasData.edges.some(edge => edge.toNode === node.id)
	);

	rootNodes.forEach(rootNode => {
		const tree = buildTree(rootNode.id, edgeMap, nodeMap, direction);
		trees.push(tree);
	});

	return trees;
}

function buildTree(nodeId: string, edgeMap: Map<string, string[]>, nodeMap: Map<string, TreeNode>, direction: 'LR' | 'RL' | 'TB' | 'BT'): TreeNode {
	const node = nodeMap.get(nodeId) as TreeNode;

	edgeMap.get(nodeId)?.forEach(childId => {
		if (shouldAddChild(nodeId, childId, direction, nodeMap)) {
			node.children.push(buildTree(childId, edgeMap, nodeMap, direction));
		}
	});
	return node;
}

function shouldAddChild(parentId: string, childId: string, direction: 'LR' | 'RL' | 'TB' | 'BT', nodeMap: Map<string, TreeNode>): boolean {
	const parent = nodeMap.get(parentId) as unknown as CanvasNodeData;
	const child = nodeMap.get(childId) as unknown as CanvasNodeData;

	switch (direction) {
		case 'LR':
			return parent.x < child.x;
		case 'RL':
			return parent.x > child.x;
		case 'TB':
			return parent.y < child.y;
		case 'BT':
			return parent.y > child.y;
		default:
			return true;
	}
}
const debuggerOn = true;
function log(...args: any[]) {
	if (debuggerOn) {
		console.log(...args);
	}
}
// TODO : Implement this function for forest layout
function getRootNode(canvas: Canvas, node: CanvasNode) {
	const canvasData = canvas.getData();
	const nodes = Array.from(canvas.nodes.values());
	const rootNode = nodes.find(node => 
		!canvasData.edges.some(edge => edge.toNode === node.id)
	);
	return rootNode;
}
function getChildNodes(canvas: Canvas, node: CanvasNode) {
	const nodes = Array.from(canvas.nodes.values());
	const edges = canvas.getData().edges.filter(edge => edge.fromNode === node.id);
	const children = edges.map(edge => 
		nodes.find(node => node.id === edge.toNode)
	).filter(child => child !== undefined);
	//remove undefined values and repeating nodes
	return children;
}

function calcNodeHeight(node: CanvasNode, canvas: Canvas) {
	const children = getChildNodes(canvas, node);
	if (!children) return node.height;
	const childrenHeights = children.map(child => calcNodeHeight(child, canvas));
	const interval = Math.max(childrenHeights.length - 1, 0) * 20;
	const totalHeight = Math.max(
		childrenHeights.reduce((total, height) => total + height, 0) + interval,
		node.height
	);
	return totalHeight;
}

// TODO : optimize this function without using recursion
// resize subtree below baseY (Y-axis is from top to bottom) and locate root at the center
function resizeNodesInSubtree(node: CanvasNode, canvas: Canvas, baseY: number, height:number){
	const children = getChildNodes(canvas, node);
	if (children === undefined) return;
	children.forEach(child => {
			const childHeight = calcNodeHeight(child, canvas);
			const x = node.x + node.width + 200;
			const y = baseY + childHeight / 2 - child.height / 2;
			log("relocate ",child.text,"of(",child.width,",",child.height,") from ",child.x,child.y ," to ", x, y,childHeight);
			child.moveTo({x, y});
			resizeNodesInSubtree(child, canvas, baseY, childHeight);
			baseY += childHeight + 20;
		}
	);
}
// origin function just consider the nodes 
// function getContainingNodes(canvas: Canvas, bbox: CanvasCoords) {

// }

function getGroups(canvas: Canvas) {
	const groups = [] ;
	canvas.nodes.forEach((node) => {
		if (node.getData().type === "group") {
			console.log("nodes in group ",canvas.getContainingNodes(node.getBBox()));
			const containingNodes = canvas.getContainingNodes(node.getBBox()).filter((n) => {
				return n.id !== node.id;
			});
			if (containingNodes.length === 0) return;
			const topChild = containingNodes.reduce((prev, curr) => {
				return prev.y < curr.y ? prev : curr;
			});
			const bottomChild = containingNodes.reduce((prev, curr) => {
				return prev.y + prev.height > curr.y + curr.height ? prev : curr;
			});
			const leftChild = containingNodes.reduce((prev, curr) => {
				return prev.x < curr.x ? prev : curr;
			});
			const rightChild = containingNodes.reduce((prev, curr) => {
				return prev.x + prev.width > curr.x + curr.width ? prev : curr;
			});

			const group = {
				groupNode: node,
				topChild: topChild,
				bottomChild: bottomChild,
				leftChild: leftChild,
				rightChild: rightChild,
				containingNodes: containingNodes.map((n) => n.id),
				x:leftChild.x - 20,
				y:topChild.y - 20,
			};
			groups.push(group);
			console.log("add group ",group);
		}
	});
	return groups;
}

function resizeGroup(canvas: Canvas,groupData: any) {
	groupData.forEach((group) => {
		const x = group.leftChild.x - 20;
		const y = group.topChild.y - 20;
		const height = group.bottomChild.y + group.bottomChild.height - group.groupNode.y + 20;
		const width = group.rightChild.x + group.rightChild.width - group.groupNode.x + 20;
		log("resize group ",group.groupNode.text," from ",group.groupNode.width,group.groupNode.height," to ",width,height);
		log("move group ",group.groupNode.text," from ",group.groupNode.x,group.groupNode.y," to ",x,y);
		group.groupNode.moveTo({
			'x': x,
			'y': y,
			'width': width,
			'height': height
		});
	});
}

function adjustNodesInGroup(canvas: Canvas, groupData: any) {
	groupData.forEach((group) => {
		group.containingNodes.forEach((nodeId) => {
			const node = canvas.nodes.get(nodeId);
			if (node.id === group.groupNode.id) return;
			const _x = group.groupNode.x - group.x + node.x;
			const _y = group.groupNode.y - group.y + node.y;
			log("relocate ",node.text,"from ",node.x,node.y," to ",_x,_y);
			node.moveTo({
				'x': _x,
				'y': _y
			});
		});
	});
}

export const adjustLayout = (canvas: Canvas,node: CanvasNode) => {
	log("adjustLayout");
	const rootNode = getRootNode(canvas,node);
	if (!rootNode) return;
	const groups = getGroups(canvas);
	resizeGroup(canvas,groups);
	const rootNodeHeight = calcNodeHeight(rootNode, canvas);
	const baseY = rootNode.y + rootNode.height / 2 - rootNodeHeight / 2;
	resizeNodesInSubtree(rootNode, canvas, baseY, rootNodeHeight);
	log("resizeNodesInSubtree");
	adjustNodesInGroup(canvas,groups);
	log("adjustNodesInGroup");
}