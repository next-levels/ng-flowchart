import { Component, ComponentFactoryResolver, ComponentRef, ElementRef, EventEmitter, HostListener, Input, Output, TemplateRef, Type, ViewChild, ViewContainerRef, ViewEncapsulation } from '@angular/core';
import { NgFlowchart } from '../model/flow.model';
import { CONSTANTS } from '../model/flowchart.constants';
import { NgFlowchartArrowComponent } from '../ng-flowchart-arrow/ng-flowchart-arrow.component';
import { NgFlowchartCanvasService } from '../ng-flowchart-canvas.service';
import { DragStep, DropDataService } from '../services/dropdata.service';

export type AddChildOptions = {
  /** Should the child be added as a sibling to existing children, if false the existing children will be reparented to this new child.
   * Default is true.
   * */
  sibling?: boolean,
  /** The index of the child. Only used when sibling is true.
   * Defaults to the end of the child array. 
   */
  index?: number,

  /** Optional data to assign to the component */
  data?: any
}

@Component({
  selector: 'ng-flowchart-step',
  templateUrl: './ng-flowchart-step.component.html',
  styleUrls: ['./ng-flowchart-step.component.scss'],
  encapsulation: ViewEncapsulation.None
})
export class NgFlowchartStepComponent {

  @HostListener('dragstart', ['$event'])
  protected onMoveStart(event: DragEvent) {
    this.hideTree();
    event.dataTransfer.setData('type', 'FROM_CANVAS');
    event.dataTransfer.setData('id', this.nativeElement.id);

    this.drop.dragStep = {
      instance: this,
      data: this.data
    }

  }

  @HostListener('dragend', ['$event'])
  protected onMoveEnd(event: DragEvent) {
    this.showTree();
  }

  //could potentially try to make this abstract
  @ViewChild('canvasContent')
  protected view: ElementRef;

  @Input()
  data: any;

  @Input()
  protected canvas: NgFlowchartCanvasService;

  @Input()
  protected compRef: ComponentRef<NgFlowchartStepComponent>;

  @Output()
  viewInit = new EventEmitter();

  @Input()
  contentTemplate: TemplateRef<any>;


  private _id: any;
  private _currentPosition = [0, 0];

  //only used if something tries to set the position before view has been initialized
  private _initPosition;
  private _isHidden = false;
  private _parent: NgFlowchartStepComponent;
  private _children: Array<NgFlowchartStepComponent>;
  private arrow: ComponentRef<NgFlowchartArrowComponent>;

  constructor(
    private drop: DropDataService,
    private viewContainer: ViewContainerRef,
    private compFactory: ComponentFactoryResolver
  ) {
    this._children = [];

  }

  canDeleteStep(): boolean {
    return true;
  }

  canDrop(dropEvent: NgFlowchart.DropTarget): boolean {
    return true;
  }

  getDropPositionsForStep(pendingStep: DragStep): NgFlowchart.DropPosition[] {
    return ['BELOW', 'LEFT', 'RIGHT', 'ABOVE'];
  }

  /**
   * 
   * @param template 
   * @param options 
   */
  async addChild(template: TemplateRef<any> | Type<NgFlowchartStepComponent>, options?: AddChildOptions): Promise<NgFlowchartStepComponent | null> {

    let componentRef = await this.canvas.createStep(template, options?.data);
    this.canvas.addToCanvas(componentRef);
    if (options?.sibling) {
      this.addChildSibling0(componentRef.instance, options?.index);
    }
    else {
      this.addChild0(componentRef.instance);
    }

    this.canvas.flow.allSteps.push(componentRef.instance);

    this.canvas.reRender();

    return componentRef.instance;
  }

  /**
   * 
   * @param recursive 
   * @param checkCallbacks 
   */
  destroy(recursive: boolean = true, checkCallbacks: boolean = true): boolean {

    if (!checkCallbacks || this.canDeleteStep()) {

      let parentIndex;
      if (this._parent) {
        parentIndex = this._parent.removeChild(this);
      }

      this.destroy0(parentIndex, recursive);

      this.canvas.reRender();

      return true;
    }
    return false;
  }

  ngOnInit(): void {

  }



  ngAfterViewInit() {
    if (!this.nativeElement) {
      throw 'Missing canvasContent ViewChild. Be sure to add #canvasContent to your root html element.'
    }

    this.nativeElement.classList.add('ngflowchart-step-wrapper');
    this.nativeElement.setAttribute('draggable', 'true');

    if (this._initPosition) {
      this.setPosition(this._initPosition);
    }

    //force id creation if not already there
    this.nativeElement.id = this.id;

    this.viewInit.emit();
  }

  get id() {
    if (this._id == null) {
      this._id = 's' + Date.now();
    }
    return this._id;
  }

  get currentPosition() {
    return this._currentPosition;
  }

  setPosition(pos: number[], offsetCenter: boolean = false) {
    if (!this.view) {
      console.warn('Trying to set position before view init');
      //save pos and set in after view init
      this._initPosition = [...pos];
      return;
    }

    let adjustedX = pos[0] - (offsetCenter ? this.nativeElement.offsetWidth / 2 : 0);
    let adjustedY = pos[1] - (offsetCenter ? this.nativeElement.offsetHeight / 2 : 0);

    this.nativeElement.style.left = `${adjustedX}px`;
    this.nativeElement.style.top = `${adjustedY}px`;

    this._currentPosition = [adjustedX, adjustedY];
  }

  // May not even need the positions passed in here,
  // Just use this._currentPosition as the end and parent_currentPosition as start
  drawArrow(start: number[], end: number[]) {
    if (!this.arrow) {
      this.createArrow();
    }
    this.arrow.instance.position = {
      start: start,
      end: end
    };
  }

  addChildSibling0(child: NgFlowchartStepComponent, index?: number): void {
    if (child._parent) {
      child._parent.removeChild(child);
    }

    if (!this.children) {
      this._children = [];
    }
    if (index == null) {
      this.children.push(child);
    }
    else {
      this.children.splice(index, 0, child);
    }

    //since we are adding a new child here, it is safe to force set the parent
    child.setParent(this, true);
  }

  addChild0(newChild: NgFlowchartStepComponent): boolean {

    if (newChild._parent) {
      newChild._parent.removeChild(newChild);
    }

    if (this.hasChildren()) {
      if (newChild.hasChildren()) {
        //if we have children and the child has children we need to confirm the child doesnt have multiple children at any point
        let newChildLastChild = newChild.findLastSingleChild();
        if (!newChildLastChild) {
          console.error('Invalid move. A node cannot have multiple parents');
          return false;
        }
        //move the this nodes children to last child of the step arg
        newChildLastChild.setChildren(this._children.slice());
      }
      else {
        //move adjacent's children to newStep
        newChild.setChildren(this._children.slice());
      }

    }
    //finally reset this nodes to children to the single new child
    this.setChildren([newChild]);
    return true;
  }


  removeChild(childToRemove: NgFlowchartStepComponent): number {
    if (!this.children) {
      return -1;
    }
    const i = this.children.findIndex(child => child.id == childToRemove.id);
    if (i > -1) {
      this.children.splice(i, 1);
    }

    return i;
  }

  setParent(newParent: NgFlowchartStepComponent, force: boolean = false): void {
    if (this.parent && !force) {
      console.warn('This child already has a parent, use force if you know what you are doing');
      return;
    }
    this._parent = newParent;
    if(!this._parent && this.arrow) {
      this.arrow.destroy();
      this.arrow = null;
    }
  }



  clearHoverIcons() {
    this.nativeElement.removeAttribute(CONSTANTS.DROP_HOVER_ATTR);
  }

  showHoverIcon(position: NgFlowchart.DropPosition) {
    this.nativeElement.setAttribute(CONSTANTS.DROP_HOVER_ATTR, position.toLowerCase());
  }

  isRootElement() {
    return !this.parent;
  }

  hasChildren(count: number = 1) {
    return this.children && this.children.length >= count;
  }

  get children() {
    return this._children;
  }

  get parent() {
    return this._parent;
  }

  /**
   * 
   * @param stepGap 
   */
  getNodeTreeWidth(stepGap: number) {
    const currentNodeWidth = this.nativeElement.getBoundingClientRect().width;

    if (!this.hasChildren()) {
      return this.nativeElement.getBoundingClientRect().width;
    }

    let childWidth = this._children.reduce((childTreeWidth, child) => {
      return childTreeWidth += child.getNodeTreeWidth(stepGap);
    }, 0)

    childWidth += stepGap * (this._children.length - 1);

    return Math.max(currentNodeWidth, childWidth);
  }

  /**
   * 
   */
  isHidden() {
    return this._isHidden;
  }

  /**
   * Return current rect of this step. The position can be animated so getBoundingClientRect cannot 
   * be reliable for positions
   * @param canvasRect Optional canvasRect to provide to offset the values
   */
  getCurrentRect(canvasRect?: DOMRect): Partial<DOMRect> {
    let clientRect = this.nativeElement.getBoundingClientRect();

    return {
      bottom: this._currentPosition[1] + clientRect.height + (canvasRect?.top || 0),
      left: this._currentPosition[0] + (canvasRect?.left || 0),
      height: clientRect.height,
      width: clientRect.width,
      right: this._currentPosition[0] + clientRect.width + (canvasRect?.left || 0),
      top: this._currentPosition[1] + (canvasRect?.top || 0)
    }
  }

  /**
   * 
   */
  toJSON() {
    return {
      id: this.id,
      data: this.data,
      children: this.hasChildren() ? this._children.map(child => {
        return child.toJSON()
      }) : []
    }
  }

  get nativeElement(): HTMLElement {
    return this.view?.nativeElement;
  }

  protected setId(id) {
    this._id = id;
  }



  ////////////////////////
  // PRIVATE IMPL

  private destroy0(parentIndex, recursive: boolean = true) {

    this.compRef.destroy();

    // //remove from master array
    let index = this.canvas.flow.allSteps.findIndex(ele => ele.id == this.id);
    if (index >= 0) {
      this.canvas.flow.allSteps.splice(index, 1);
    }

    if (this.hasChildren()) {

      //this was the root node
      if (this.isRootElement()) {
        this.canvas.flow.rootStep = null;

        if (!recursive) {

          let newRoot = this._children[0];
          //set first child as new root
          this.canvas.flow.rootStep = newRoot;
          newRoot.setParent(null, true);

          //make previous siblings children of the new root
          if (this.hasChildren(2)) {
            for (let i = 1; i < this._children.length; i++) {
              let child = this._children[i];
              child.setParent(newRoot, true);
              newRoot._children.push(child);
            }
          }
        }

      }

      //update children
      let length = this._children.length;
      for (let i = 0; i < length; i++) {
        let child = this._children[i];
        if (recursive) {
          (child as NgFlowchartStepComponent).destroy0(null, true);
        }

        //not the original root node
        else if (!!this._parent) {
          this._parent._children.splice(i + parentIndex, 0, child);
          child.setParent(this._parent, true);
        }
      }
      this.setChildren([]);
    }
    this._parent = null;
  }

  private createArrow() {
    const factory = this.compFactory.resolveComponentFactory(NgFlowchartArrowComponent)
    this.arrow = this.viewContainer.createComponent(factory);
    this.nativeElement.parentElement.appendChild(this.arrow.location.nativeElement);
  }

  private hideTree() {
    this._isHidden = true;
    this.nativeElement.style.opacity = '.4';

    if(this.arrow) {
      this.arrow.instance.hideArrow();
    }

    if (this.hasChildren()) {
      this._children.forEach(child => {
        child.hideTree();
      })
    }
  }

  private showTree() {
    this._isHidden = false;

    if(this.arrow) {
      this.arrow.instance.showArrow();
    }

    this.nativeElement.style.opacity = '1';
    if (this.hasChildren()) {
      this._children.forEach(child => {
        child.showTree();
      })
    }
  }

  private findLastSingleChild() {
    //two or more children means we have no single child
    if (this.hasChildren(2)) {
      return null;
    }
    //if one child.. keep going down the tree until we find no children or 2 or more
    else if (this.hasChildren()) {
      return this._children[0].findLastSingleChild();
    }
    //if no children then this is the last single child
    else return this;
  }

  private setChildren(children: Array<NgFlowchartStepComponent>): void {
    this._children = children;
    this.children.forEach(child => {
      child.setParent(this, true);
    })
  }

}
